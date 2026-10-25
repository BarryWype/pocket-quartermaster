import { expeditionRules } from '@/content/dungeons';
import { elementRules } from '@/content/elements';
import { dungeonById, itemById } from '@/content/lookup';

import type { Element } from '../elements';
import type { BossDef, ConsumableDef, DungeonDef, EncounterDef } from '../types';
import { simulateRun, type PartyMember } from './simulate';

/** No mishaps or run-wide luck, so each test sees the mechanic it targets. */
const calm = { ...expeditionRules, mishapChance: 0, fortune: 0 };
/** Also no variance or crits, so numbers can be checked exactly. */
const steady = { ...calm, damageVariance: 0, critChance: 0 };

function member(heroId: string, overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    heroId,
    name: heroId,
    classId: 'warrior',
    weaponName: null,
    maxHp: 100,
    damage: 10,
    defense: 0,
    threat: 1,
    resists: [],
    traits: [],
    consumable: null,
    ...overrides,
  };
}

function dungeon(encounters: EncounterDef[], boss: Partial<BossDef> = {}, count: [number, number] = [2, 2]): DungeonDef {
  return {
    ...dungeonById.ratCellar,
    encounterCount: count,
    encounters,
    boss: { id: 'testBoss', name: 'test boss', hp: 100, damage: 5, ...boss },
  };
}

const bossOnly = (boss: Partial<BossDef> = {}) => dungeon([{ type: 'event', weight: 1, eventId: 'cache' }], boss);
const trap = (overrides: Partial<Extract<EncounterDef, { type: 'trap' }>> = {}): EncounterDef => ({
  type: 'trap',
  weight: 1,
  name: 'test trap',
  damagePct: 0.2,
  targets: 'all',
  triggerChance: 1,
  ...overrides,
});
const potion = itemById.healingPotion as ConsumableDef;
const ration = itemById.ration as ConsumableDef;

describe('simulateRun', () => {
  it('gives the same result for the same party, dungeon and seed', () => {
    const party = [member('a'), member('b', { classId: 'archer' })];
    const real = dungeonById.goblinWarren;
    expect(simulateRun(party, real, 'seed', { rules: calm })).toEqual(simulateRun(party, real, 'seed', { rules: calm }));
    expect(simulateRun(party, real, 'seed', { rules: calm })).not.toEqual(simulateRun(party, real, 'other', { rules: calm }));
  });

  it('ends with the boss', () => {
    const run = simulateRun([member('a', { damage: 1000 })], dungeonById.banditStockade, 'x', { rules: calm });
    expect(run.encounters[run.encounters.length - 1].kind).toBe('boss');
    expect(run.encounters).toHaveLength(run.encounterCount);
  });
});

describe('fights', () => {
  // Plenty of HP so nobody is knocked out and fights run their full course.
  const tough = { maxHp: 1e6 };
  const boss = bossOnly({ hp: 300, damage: 10 });
  const bossFight = (party: PartyMember[]) =>
    simulateRun(party, boss, 's', { rules: steady }).encounters.find((e) => e.kind === 'boss')!;

  it('takes fewer rounds with more attack', () => {
    const strong = bossFight([member('a', { ...tough, damage: 30 })]);
    const weak = bossFight([member('a', { ...tough, damage: 10 })]);
    expect(strong.rounds).toBeLessThan(weak.rounds);
  });

  it('takes less damage with more defense', () => {
    const exposed = bossFight([member('a', { ...tough, damage: 30 })]).taken.a;
    const armoured = bossFight([member('a', { ...tough, damage: 30, defense: 25 })]).taken.a;
    expect(armoured).toBeCloseTo(exposed * (100 / (100 + steady.defenseFactor * 25)));
  });

  it('hurts heroes unprotected from the element more', () => {
    const fire = bossOnly({ hp: 300, damage: 10, element: 'fire' });
    const taken = (resists: Element[]) =>
      simulateRun([member('a', { ...tough, damage: 30, resists })], fire, 's', { rules: steady }).encounters.find(
        (e) => e.kind === 'boss',
      )!.taken.a;
    expect(taken([])).toBeCloseTo(taken(['fire']) * elementRules.unprotectedMultiplier);
  });

  it('aims at heroes with more threat more often', () => {
    const party = [member('tank', { threat: 3, maxHp: 1e6 }), member('mage', { maxHp: 1e6 })];
    const taken = { tank: 0, mage: 0 };
    for (let i = 0; i < 50; i++) {
      const fight = simulateRun(party, bossOnly({ hp: 300 }), `t${i}`, { rules: calm }).encounters.find((e) => e.kind === 'boss')!;
      taken.tank += fight.taken.tank ?? 0;
      taken.mage += fight.taken.mage ?? 0;
    }
    expect(taken.tank).toBeGreaterThan(taken.mage * 2);
  });
});

describe('traps and events', () => {
  it('takes a share of max HP from everyone it catches', () => {
    const run = simulateRun([member('a'), member('b', { maxHp: 50 })], dungeon([trap()]), 's', { rules: steady });
    const caught = run.encounters[0];
    expect(caught.trapTriggered).toBe(true);
    expect(caught.taken).toEqual({ a: 20, b: 10 });
  });

  it('can be avoided by a matching trait or protection', () => {
    const run = simulateRun(
      [member('a', { traits: ['spotTraps'] }), member('b')],
      dungeon([trap({ avoidedBy: 'spotTraps' })]),
      's',
      { rules: calm },
    );
    expect(run.encounters[0].avoided).toEqual(['a']);
    expect(Object.keys(run.encounters[0].taken)).toEqual(['b']);
  });

  it('does nothing when it does not trigger', () => {
    const run = simulateRun([member('a')], dungeon([trap({ triggerChance: 0 })]), 's', { rules: calm });
    expect(run.encounters[0]).toMatchObject({ trapTriggered: false, taken: {} });
  });

  it('heals at a spring, up to max HP', () => {
    const pool: EncounterDef[] = [trap({ damagePct: 0.5, targets: 'all' }), { type: 'event', weight: 1, eventId: 'spring' }];
    const runs = Array.from({ length: 40 }, (_, i) => simulateRun([member('a')], dungeon(pool, {}, [6, 6]), `s${i}`, { rules: calm }));
    const springsAfterDamage = runs
      .flatMap((run) => run.encounters)
      .filter((e) => e.kind === 'spring' && (e.healed.a ?? 0) > 0);
    expect(springsAfterDamage.length).toBeGreaterThan(0);
    springsAfterDamage.forEach((spring) => expect(spring.healed.a).toBeLessThanOrEqual(30 + 1e-9));
  });

  it('adds bonus gold from a cache', () => {
    const run = simulateRun([member('a', { damage: 1000 })], bossOnly(), 's', { rules: calm });
    expect(run.bonusGold).toBe(Math.round(0.25 * dungeonById.ratCellar.gold[1]));
  });
});

describe('consumables', () => {
  it('drinks a potion once below the threshold', () => {
    const run = simulateRun([member('a', { consumable: potion })], dungeon([trap({ damagePct: 0.7 })]), 's', {
      rules: steady,
    });
    const caught = run.encounters[0];
    expect(caught.consumed).toEqual(['a']);
    // Down to 30 HP, then a potion heals back to full.
    expect(caught.healed.a).toBeCloseTo(70);
    expect(run.consumed).toEqual(['a']);
  });

  it('keeps the potion when HP never drops that low', () => {
    const gentleBoss = dungeon([trap({ damagePct: 0.2 })], { damage: 1 });
    const run = simulateRun([member('a', { consumable: potion })], gentleBoss, 's', { rules: calm });
    expect(run.consumed).toEqual([]);
  });

  it('eats a ration before the boss', () => {
    const run = simulateRun(
      [member('a', { consumable: ration, damage: 1000 })],
      dungeon([trap({ damagePct: 0.5 })]),
      's',
      { rules: steady },
    );
    const bossFight = run.encounters.find((e) => e.kind === 'boss')!;
    expect(bossFight.consumed).toEqual(['a']);
    expect(bossFight.healed.a).toBeCloseTo(25);
  });
});

describe('knock-outs and outcomes', () => {
  it('is flawless when nobody is knocked out', () => {
    const run = simulateRun([member('a', { damage: 1000 })], bossOnly(), 's', { rules: calm });
    expect(run.outcome).toBe('flawless');
    expect(run.encountersCleared).toBe(2);
  });

  it('still succeeds when someone falls but the boss is beaten', () => {
    const party = [member('weak', { maxHp: 1, threat: 100 }), member('strong', { maxHp: 1e6, damage: 20 })];
    const run = simulateRun(party, bossOnly({ hp: 200, damage: 10 }), 's', { rules: steady });
    expect(run.bossDefeated).toBe(true);
    expect(run.outcome).toBe('success');
  });

  it('retreats when everyone is knocked out, keeping what was cleared', () => {
    const run = simulateRun([member('a', { damage: 1 })], bossOnly({ hp: 1e6, damage: 50 }), 's', { rules: calm });
    expect(run.outcome).toBe('retreat');
    expect(run.bossDefeated).toBe(false);
    expect(run.encountersCleared).toBe(1);
    expect(run.hp).toEqual([{ heroId: 'a', hp: 0, maxHp: 100 }]);
  });

  it('is a defeat when the team falls at the first encounter', () => {
    const run = simulateRun([member('a', { maxHp: 1 })], dungeon([trap({ damagePct: 1 })]), 's', { rules: calm });
    expect(run.outcome).toBe('defeat');
    expect(run.encountersCleared).toBe(0);
  });

  it('can end any run early with a mishap, but never a guaranteed one', () => {
    const unlucky = { ...calm, mishapChance: 1 };
    const run = simulateRun([member('a', { damage: 1000, maxHp: 1e6 })], dungeonById.ratCellar, 's', { rules: unlucky });
    expect(run.encounters[run.encounters.length - 1].kind).toBe('mishap');
    expect(run.bossDefeated).toBe(false);
    expect(['retreat', 'defeat']).toContain(run.outcome);
    const tutorial = simulateRun([member('a', { damage: 1000 })], dungeonById.ratCellar, 's', {
      rules: unlucky,
      guaranteed: true,
    });
    expect(tutorial.bossDefeated).toBe(true);
  });

  it('never knocks anyone out on a guaranteed run, so the boss always falls', () => {
    const run = simulateRun([member('a', { damage: 1, maxHp: 5 })], bossOnly({ hp: 200, damage: 50 }), 's', {
      guaranteed: true,
    });
    expect(run.bossDefeated).toBe(true);
    expect(run.hp[0].hp).toBeGreaterThan(0);
  });
});
