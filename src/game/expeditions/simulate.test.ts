import { expeditionRules } from '@/content/dungeons';
import { elementRules } from '@/content/elements';
import { dungeonById, itemById } from '@/content/lookup';

import type { Element } from '../elements';
import type { BossDef, Briefing, ConsumableDef, DungeonDef, EncounterDef, ThreatId } from '../types';
import { mealParty, simulateRun, type PartyMember } from './simulate';

/** No mishaps or run-wide luck, so each test sees the mechanic it targets. */
const calm = { ...expeditionRules, mishapChance: 0, fortune: 0 };
/** Also no variance or crits, so numbers can be checked exactly. */
const steady = { ...calm, damageVariance: 0, enemyCritChance: 0 };

function member(heroId: string, overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    heroId,
    name: heroId,
    classId: 'warrior',
    traitId: 'none',
    weaponName: null,
    gearKeywords: [],
    heavy: false,
    concealed: false,
    maxHp: 100,
    hp: overrides.hp ?? overrides.maxHp ?? 100,
    power: 10,
    magic: 0,
    damageStat: 'power',
    armour: 0,
    resistance: 0,
    evasion: 0,
    speed: 5,
    crit: 0,
    luck: 0,
    threat: 1,
    resists: [],
    abilities: [],
    consumable: null,
    ...overrides,
  };
}

function dungeon(encounters: EncounterDef[], boss: Partial<BossDef> = {}, count: [number, number] = [2, 2]): DungeonDef {
  return {
    ...dungeonById.ratCellar,
    encounterCount: count,
    encounters,
    boss: { id: 'testBoss', name: 'test boss', hp: 100, damage: 5, damageType: 'power', speed: 5, tags: [], ...boss },
  };
}

const bossOnly = (boss: Partial<BossDef> = {}) => dungeon([{ type: 'event', weight: 1, eventId: 'cache' }], boss);
const trap = (overrides: Partial<Extract<EncounterDef, { type: 'trap' }>> = {}): EncounterDef => ({
  type: 'trap',
  weight: 1,
  name: 'test trap',
  targets: 'all',
  ...overrides,
});
const potion = itemById.healingPotion as ConsumableDef;

/** A briefing with one threat at `level`; a party of finesse-1 warriors misses level 2 and up. */
const briefingOf = (id: ThreatId, level: 1 | 2 | 3 = 1, extra: Partial<Briefing> = {}): Briefing => ({
  threats: [{ id, level }],
  restriction: null,
  opportunity: null,
  ...extra,
});

describe('simulateRun', () => {
  it('gives the same result for the same party, dungeon and seed', () => {
    const party = [member('a'), member('b', { classId: 'ranger' })];
    const real = dungeonById.goblinWarren;
    const briefing = briefingOf('traps');
    expect(simulateRun(party, real, 'seed', { rules: calm, briefing })).toEqual(
      simulateRun(party, real, 'seed', { rules: calm, briefing }),
    );
    expect(simulateRun(party, real, 'seed', { rules: calm, briefing })).not.toEqual(
      simulateRun(party, real, 'other', { rules: calm, briefing }),
    );
  });

  it('ends with the boss', () => {
    const run = simulateRun([member('a', { power: 1000, maxHp: 1e6 })], dungeonById.banditStockade, 'x', { rules: calm });
    expect(run.encounters[run.encounters.length - 1].kind).toBe('boss');
    expect(run.encounters).toHaveLength(run.encounterCount);
  });

  it('plays no threats at all without a briefing', () => {
    const run = simulateRun([member('a')], dungeon([trap()]), 's', { rules: steady });
    expect(run.threats).toEqual([]);
    expect(run.encounters[0]).toMatchObject({ kind: 'quiet', cleared: true, taken: {} });
    expect(run.lostLoot).toBe(0);
    expect(run.delay).toBe(0);
  });
});

describe('fights', () => {
  // Plenty of HP so nobody is knocked out and fights run their full course.
  const tough = { maxHp: 1e6 };
  const boss = bossOnly({ hp: 300, damage: 10 });
  const bossFight = (party: PartyMember[]) =>
    simulateRun(party, boss, 's', { rules: steady }).encounters.find((e) => e.kind === 'boss')!;

  it('takes fewer rounds with more attack', () => {
    const strong = bossFight([member('a', { ...tough, power: 30 })]);
    const weak = bossFight([member('a', { ...tough, power: 10 })]);
    expect(strong.rounds).toBeLessThan(weak.rounds);
  });

  it('takes less damage with more armour', () => {
    const exposed = bossFight([member('a', { ...tough, power: 30 })]).taken.a;
    const armoured = bossFight([member('a', { ...tough, power: 30, armour: 25 })]).taken.a;
    expect(armoured).toBeCloseTo(exposed * (100 / (100 + steady.defenseFactor * 25)));
  });

  it('hurts heroes unprotected from the element more', () => {
    const fire = bossOnly({ hp: 300, damage: 10, element: 'fire' });
    const taken = (resists: Element[]) =>
      simulateRun([member('a', { ...tough, power: 30, resists })], fire, 's', { rules: steady }).encounters.find(
        (e) => e.kind === 'boss',
      )!.taken.a;
    expect(taken([])).toBeCloseTo(taken(['fire']) * elementRules.unprotectedMultiplier);
  });

  it('aims at heroes with more threat more often', () => {
    const party = [member('tank', { threat: 3, maxHp: 1e6 }), member('mage', { maxHp: 1e6 })];
    const taken = { tank: 0, mage: 0 };
    for (let i = 0; i < 50; i++) {
      const fight = simulateRun(party, bossOnly({ hp: 300 }), `t${i}`, { rules: calm }).encounters.find(
        (e) => e.kind === 'boss',
      )!;
      taken.tank += fight.taken.tank ?? 0;
      taken.mage += fight.taken.mage ?? 0;
    }
    expect(taken.tank).toBeGreaterThan(taken.mage * 2);
  });
});

describe('traps', () => {
  it('wound each hero it catches by the missed threat\'s share of max HP', () => {
    // Finesse 1 against level 2 (needs 3): a full miss, trapWounds 12%.
    const briefing = briefingOf('traps', 2);
    const run = simulateRun([member('a'), member('b', { maxHp: 50 })], dungeon([trap()]), 's', { rules: steady, briefing });
    const caught = run.encounters[0];
    expect(caught.trapTriggered).toBe(true);
    expect(caught.taken).toEqual({ a: 12, b: 6 });
  });

  it('catch nobody when the threat is met', () => {
    const briefing = briefingOf('traps');
    const run = simulateRun([member('a', { classId: 'thief' })], dungeon([trap()]), 's', { rules: steady, briefing });
    expect(run.encounters[0]).toMatchObject({ trapTriggered: false, taken: {}, cleared: true });
  });

  it('wound half as much on a half miss', () => {
    // Finesse 1 against level 1 (needs 2): one short, so half of the 8%.
    const briefing = briefingOf('traps');
    const run = simulateRun([member('a')], dungeon([trap()]), 's', { rules: steady, briefing });
    expect(run.encounters[0].taken).toEqual({ a: 4 });
  });

  it('are quiet steps without the traps threat in the briefing', () => {
    const run = simulateRun([member('a')], dungeon([trap()]), 's', { rules: steady, briefing: briefingOf('beasts') });
    expect(run.encounters[0]).toMatchObject({ kind: 'quiet', cleared: true, taken: {} });
  });

  it('wound through the element rules for elemental traps', () => {
    const briefing = briefingOf('traps', 2);
    const fire = trap({ element: 'fire' });
    const taken = simulateRun([member('a')], dungeon([fire]), 's', { rules: steady, briefing }).encounters[0].taken.a;
    expect(taken).toBeCloseTo(12 * elementRules.unprotectedMultiplier);
  });

  it('are guaranteed an encounter when the threat is drawn but none was rolled', () => {
    const briefing = briefingOf('traps');
    // A pool where the trap can be missed by the draw: it still shows up before the boss.
    const pool: EncounterDef[] = [
      { type: 'event', weight: 1, eventId: 'spring' },
      { type: 'trap', weight: 1e-9, name: 'hidden trap', targets: 'all' },
    ];
    const runs = Array.from({ length: 10 }, (_, i) =>
      simulateRun([member('a', { maxHp: 1e6 })], dungeon(pool, {}, [3, 3]), `g${i}`, { rules: steady, briefing }),
    );
    runs.forEach((run) => expect(run.encounters.some((e) => e.kind === 'trap')).toBe(true));
  });
});

describe('obstacles and events are quiet steps', () => {
  it('clears them without a scratch, and pay no gold', () => {
    const pool: EncounterDef[] = [
      { type: 'obstacle', weight: 1, name: 'rubble pile', kind: 'rubble' },
      { type: 'event', weight: 1, eventId: 'spring' },
      { type: 'event', weight: 1, eventId: 'cache' },
      { type: 'event', weight: 1, eventId: 'ambush' },
    ];
    const run = simulateRun([member('a', { power: 1000 })], dungeon(pool, {}, [5, 5]), 's', { rules: steady });
    for (const encounter of run.encounters.slice(0, 4)) {
      expect(encounter).toMatchObject({ kind: 'quiet', cleared: true, taken: {}, dealt: {}, rounds: 0 });
    }
    expect(run.bonusGold).toBe(0);
  });
});

describe('consumables', () => {
  /** Four live traps at level 3: 72% of max HP in wounds, enough to reach the potion threshold. */
  const wounded = (overrides: { consumable?: ConsumableDef | null; meal?: { kind: 'bossHeal'; pct: number } } = {}) =>
    simulateRun(
      [member('a', { consumable: overrides.consumable ?? null })],
      dungeon([trap(), trap(), trap(), trap()], { damage: 1 }, [5, 5]),
      's',
      { rules: steady, briefing: briefingOf('traps', 3), ...(overrides.meal ? { meal: overrides.meal } : {}) },
    );

  it('drinks a potion once below the threshold', () => {
    const run = wounded({ consumable: potion });
    const drank = run.encounters.find((e) => e.consumed.includes('a'))!;
    expect(run.consumed).toEqual(['a']);
    expect(drank.healed.a).toBeCloseTo(30);
  });

  it('drinks each potion its own share of max HP', () => {
    for (const [id, share] of [['standardHealingPotion', 50], ['greaterHealingPotion', 70]] as const) {
      const run = wounded({ consumable: itemById[id] as ConsumableDef });
      const drank = run.encounters.find((e) => e.consumed.includes('a'))!;
      expect(drank.healed.a).toBeCloseTo(share);
    }
  });

  it('adds the grilled trout’s crit to every member of the meal party', () => {
    const eaten = mealParty([member('a'), member('b')], { kind: 'crit', add: 10 });
    expect(eaten.map((m) => m.crit)).toEqual([10, 10]);
  });

  it('keeps the potion when HP never drops that low', () => {
    const briefing = briefingOf('traps');
    const gentleBoss = dungeon([trap()], { damage: 1 });
    const run = simulateRun([member('a', { consumable: potion })], gentleBoss, 's', { rules: calm, briefing });
    expect(run.consumed).toEqual([]);
  });

  it('shares a Hunter’s stew before the boss', () => {
    const run = wounded({ meal: { kind: 'bossHeal', pct: 0.15 } });
    const bossFight = run.encounters.find((e) => e.kind === 'boss')!;
    expect(bossFight.effects).toContainEqual({ heroId: null, key: 'stew' });
    expect(bossFight.healed.a).toBeCloseTo(15);
  });
});

describe('knock-outs and outcomes', () => {
  it('is flawless when nobody is knocked out', () => {
    const run = simulateRun([member('a', { power: 1000 })], bossOnly(), 's', { rules: calm });
    expect(run.outcome).toBe('flawless');
    expect(run.encountersCleared).toBe(2);
  });

  it('still succeeds when someone falls but the boss is beaten', () => {
    const party = [member('weak', { maxHp: 1, threat: 100 }), member('strong', { maxHp: 1e6, power: 20 })];
    const run = simulateRun(party, bossOnly({ hp: 200, damage: 10 }), 's', { rules: steady });
    expect(run.bossDefeated).toBe(true);
    expect(run.outcome).toBe('success');
  });

  it('retreats when everyone is knocked out, keeping what was cleared', () => {
    const run = simulateRun([member('a', { power: 1 })], bossOnly({ hp: 1e6, damage: 50 }), 's', { rules: calm });
    expect(run.outcome).toBe('retreat');
    expect(run.bossDefeated).toBe(false);
    expect(run.encountersCleared).toBe(1);
    expect(run.hp).toEqual([{ heroId: 'a', hp: 0, maxHp: 100 }]);
  });

  it('is a defeat when the team falls at the first encounter', () => {
    const slaughter: EncounterDef = { type: 'fight', weight: 1, mobs: [{ mobId: 'goblinSlinger', count: 20 }] };
    const run = simulateRun([member('a', { power: 1 })], dungeon([slaughter]), 's', { rules: calm });
    expect(run.outcome).toBe('defeat');
    expect(run.encountersCleared).toBe(0);
  });

  it('can end any run early with a mishap, but never a guaranteed one', () => {
    const unlucky = { ...calm, mishapChance: 1 };
    const run = simulateRun([member('a', { power: 1000, maxHp: 1e6 })], dungeonById.ratCellar, 's', { rules: unlucky });
    expect(run.encounters[run.encounters.length - 1].kind).toBe('mishap');
    expect(run.bossDefeated).toBe(false);
    expect(['retreat', 'defeat']).toContain(run.outcome);
    const tutorial = simulateRun([member('a', { power: 1000 })], dungeonById.ratCellar, 's', {
      rules: unlucky,
      guaranteed: true,
    });
    expect(tutorial.bossDefeated).toBe(true);
  });

  it('never knocks anyone out on a guaranteed run, so the boss always falls', () => {
    const run = simulateRun([member('a', { power: 1, maxHp: 5 })], bossOnly({ hp: 200, damage: 50 }), 's', {
      guaranteed: true,
    });
    expect(run.bossDefeated).toBe(true);
    expect(run.hp[0].hp).toBeGreaterThan(0);
  });
});
