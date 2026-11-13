import { expeditionRules } from '@/content/dungeons';
import { familyEffectRules as R } from '@/content/families';
import { itemById } from '@/content/lookup';

import type { Briefing, ConsumableDef } from '../types';
import { familyFight, steady, type FamilyFight, type FightSetup } from './familyTestHelpers';
import { simulateRun } from './simulate';
import { reportTally, type Contribution, type RunTally } from './tally';
import { tallyCase } from './tallyCases';

const withTally = (setup: FightSetup = {}): FightSetup => ({ ...setup, options: { ...setup.options, tally: true } });
const contribution = (f: FamilyFight, kind: Contribution['kind'], id: string) =>
  f.run.tally!.contributions.find((c) => c.kind === kind && c.id === id);
const sum = (record: Record<string, number>) => Object.values(record).reduce((total, n) => total + n, 0);
const briefing = (threats: Briefing['threats']): Briefing => ({ threats, restriction: null, opportunity: null });
const sturdy = { a: { maxHp: 1e6 } };

describe('run tally', () => {
  it('changes no run: the same seeds play out the same with the tally on and off', () => {
    for (let i = 0; i < 150; i++) {
      const c = tallyCase(i);
      const off = simulateRun(c.party, c.dungeon, c.seed, c.options);
      const { tally, ...on } = simulateRun(c.party, c.dungeon, c.seed, { ...c.options, tally: true });
      expect(off.tally).toBeUndefined();
      expect(tally).toBeDefined();
      expect(on).toEqual(off);
    }
  });

  it('credits a family level with the damage it kept off', () => {
    const on = familyFight('warding', 1, withTally({ boss: { element: 'fire' }, party: sturdy }));
    expect(contribution(on, 'family', 'warding1')!.prevented).toBeCloseTo(sum(on.fight.taken) * (1 / R.warding.elementalTaken - 1));
  });

  it('credits a family level with the damage it dealt', () => {
    const setup = withTally({ boss: { element: 'fire' }, party: sturdy });
    const on = familyFight('warding', 3, setup);
    const off = familyFight(null, 0, setup);
    expect(contribution(on, 'family', 'warding3')!.damage).toBeCloseTo(on.fight.dealt.a - off.fight.dealt.a);
  });

  it('credits an affix with the share of each hit it added', () => {
    const on = familyFight(null, 0, withTally({ boss: { tags: ['beast'] }, party: { a: { maxHp: 1e6, affixes: { hunter: 20 } } } }));
    expect(contribution(on, 'affix', 'hunter')).toMatchObject({ heroId: 'a', damage: expect.closeTo(on.fight.dealt.a * (1 - 1 / 1.2), 6) });
  });

  it('credits a healing potion, at the boss, with its hero still standing', () => {
    const potion = itemById.healingPotion as ConsumableDef;
    const on = familyFight(null, 0, withTally({ boss: { hp: 100, damage: 12 }, party: { a: { consumable: potion } } }));
    expect(on.run.consumed).toEqual(['a']);
    expect(contribution(on, 'consumable', 'healingPotion')).toMatchObject({ healing: on.fight.healed.a, boss: true, stood: true });
  });

  it('records the killing blow on the boss', () => {
    const on = familyFight(null, 0, withTally({ boss: { hp: 30 }, party: { a: {}, b: { power: 0 } } }));
    expect(on.run.bossDefeated).toBe(true);
    expect(on.run.tally!.heroes).toEqual([
      expect.objectContaining({ heroId: 'a', kills: 1, eliteKills: 1, bossKill: true, dealt: on.fight.dealt.a }),
      expect.objectContaining({ heroId: 'b', kills: 0, bossKill: false }),
    ]);
  });

  it('records what a missed threat cost: trap wounds', () => {
    const on = familyFight(null, 0, withTally({ traps: 1, party: sturdy, options: { briefing: briefing([{ id: 'traps', level: 1 }]) } }));
    const trap = on.run.encounters.find((e) => e.kind === 'trap')!;
    expect(trap.trapTriggered).toBe(true);
    expect(on.run.tally!.threats.traps).toEqual({ taken: sum(trap.taken), lost: 0, firstStrikes: 0 });
  });

  it('records what a missed threat cost: the first strike, and the softer hits', () => {
    const on = familyFight(null, 0, withTally({ party: sturdy, options: { briefing: briefing([{ id: 'darkness', level: 1 }]) } }));
    const off = familyFight(null, 0, withTally({ party: sturdy }));
    const cost = on.run.tally!.threats.darkness!;
    expect(cost.firstStrikes).toBe(1);
    expect(cost.taken).toBeGreaterThan(0);
    expect(cost.lost).toBeCloseTo(off.fight.dealt.a - on.fight.dealt.a);
  });

  it('runs at the same steady rules give the same tally', () => {
    const setup = withTally({ boss: { element: 'fire' }, party: sturdy, options: { rules: steady } });
    expect(familyFight('warding', 3, setup).run.tally).toEqual(familyFight('warding', 3, setup).run.tally);
  });
});

describe('report tally', () => {
  const entry = (id: string, damage: number, extra: Partial<Contribution> = {}): Contribution => ({
    kind: 'affix',
    id,
    heroId: 'a',
    damage,
    prevented: 0,
    healing: 0,
    turns: 0,
    fights: 0,
    saves: 0,
    ...extra,
  });
  const tally: RunTally = {
    heroes: [{ heroId: 'a', dealt: 10.4, taken: 3.6, healing: 0.2, kills: 1, eliteKills: 0, bossKill: false, knockouts: 0, specials: 2 }],
    contributions: [
      entry('small', 0.4),
      entry('turns', 0, { turns: 2 }),
      ...Array.from({ length: 12 }, (_, i) => entry(`big${i}`, 100 + i)),
    ],
    threats: { traps: { taken: 12.6, lost: 0, firstStrikes: 0 }, beasts: { taken: 0.2, lost: 0, firstStrikes: 0 } },
  };

  it('keeps whole numbers, the largest contributions only, and threats that cost something', () => {
    const kept = reportTally(tally, 100);
    expect(kept.heroes[0]).toMatchObject({ dealt: 10, taken: 4, healing: 0 });
    expect(kept.contributions).toHaveLength(expeditionRules.tally.contributionsKept);
    expect(kept.contributions[0].id).toBe('big11');
    expect(kept.contributions.map((c) => c.id)).not.toContain('small');
    expect(kept.threats).toEqual({ traps: { taken: 13, lost: 0, firstStrikes: 0 } });
  });

  it('values denied turns at a share of the party’s max HP', () => {
    const turns = reportTally({ ...tally, contributions: [entry('small', 0.4), entry('turns', 0, { turns: 2 })] }, 100);
    expect(turns.contributions.map((c) => c.id)).toEqual(['turns']);
  });
});
