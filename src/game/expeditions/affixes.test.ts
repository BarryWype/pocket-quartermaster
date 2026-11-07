import { expeditionRules } from '@/content/dungeons';
import { dungeonById, itemById } from '@/content/lookup';

import type { BossDef, ConsumableDef, DungeonDef } from '../types';
import { simulateRun, type PartyMember, type RunResult } from './simulate';

/** No mishaps or run-wide luck, so each test sees the mechanic it targets. */
const calm = { ...expeditionRules, mishapChance: 0, fortune: 0 };
/** Also no variance or enemy crits, so numbers can be checked exactly. */
const steady = { ...calm, damageVariance: 0, enemyCritChance: 0 };

function member(heroId: string, affixes: Record<string, number> = {}, overrides: Partial<PartyMember> = {}): PartyMember {
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
    familyTags: [],
    abilities: [],
    consumable: null,
    affixes,
    ...overrides,
  };
}

/** A dungeon with only its boss: one fight, played round by round. */
function dungeon(boss: Partial<BossDef> = {}): DungeonDef {
  return {
    ...dungeonById.ratCellar,
    encounterCount: [1, 1],
    encounters: [],
    boss: { id: 'testBoss', name: 'test boss', hp: 1e6, damage: 5, damageType: 'power', speed: 5, tags: [], ...boss },
  };
}

/** The boss fight of a seeded run. */
const bossFight = (party: PartyMember[], boss: Partial<BossDef> = {}, rules = steady) => {
  const run = simulateRun(party, dungeon(boss), 'seed', { rules });
  const fight = run.encounters.find((e) => e.kind === 'boss');
  if (!fight) throw new Error('no boss fight');
  return { run, fight };
};

const bossRun = (party: PartyMember[], boss: Partial<BossDef> = {}, rules = steady): RunResult => bossFight(party, boss, rules).run;

describe('gear affixes', () => {
  it('damageVs lifts hits against a foe it names', () => {
    const boss: Partial<BossDef> = { tags: ['beast'] };
    const dealt = (affixes: Record<string, number>, foes: Partial<BossDef> = boss) =>
      bossFight([member('a', affixes, { maxHp: 1e6 })], foes).fight.dealt.a;
    expect(dealt({})).toBeCloseTo(400, 5);
    expect(dealt({ hunter: 20 })).toBeCloseTo(480, 5);
    expect(dealt({ hunter: 20 }, { tags: ['undead'] })).toBeCloseTo(400, 5);
  });

  it('damageFrom blunts hits from a foe it names', () => {
    const rules = { ...steady, maxRounds: 1 };
    const taken = (foes: Partial<BossDef>, affixes: Record<string, number>) =>
      bossFight([member('a', affixes)], foes, rules).fight.taken.a;
    const boss: Partial<BossDef> = { damage: 50, tags: ['beast'] };
    expect(taken(boss, {})).toBeCloseTo(50, 5);
    expect(taken(boss, { thickHide: 20 })).toBeCloseTo(40, 5);
    expect(taken({ damage: 50, tags: ['undead'] } as Partial<BossDef>, { thickHide: 20 })).toBeCloseTo(50, 5);
  });

  it('magicDamageTaken blunts magic hits only', () => {
    const rules = { ...steady, maxRounds: 1 };
    const taken = (damageType: 'power' | 'magic', affixes: Record<string, number>) =>
      bossFight([member('a', affixes)], { damage: 50, damageType }, rules).fight.taken.a;
    expect(taken('magic', {})).toBeCloseTo(50, 5);
    expect(taken('magic', { spiritWard: 10 })).toBeCloseTo(45, 5);
    expect(taken('power', { spiritWard: 10 })).toBeCloseTo(50, 5);
  });

  it('warding and elementResistAll blunt elemental hits, stacked multiplicatively', () => {
    const rules = { ...steady, maxRounds: 1 };
    const taken = (affixes: Record<string, number>, foes: Partial<BossDef> = { damage: 50, element: 'fire' }) =>
      bossFight([member('a', affixes)], foes, rules).fight.taken.a;
    // An elemental hit without Resist takes extra damage.
    const base = taken({});
    expect(base).toBeCloseTo(75, 5);
    expect(taken({ wardingFire: 25 })).toBeCloseTo(base * 0.75, 5);
    expect(taken({ dragonhide: 10 })).toBeCloseTo(base * 0.9, 5);
    expect(taken({ wardingFire: 25, dragonhide: 10 })).toBeCloseTo(base * 0.75 * 0.9, 5);
    // A hit without an element takes none of it.
    expect(taken({ wardingFire: 25 }, { damage: 50 })).toBeCloseTo(50, 5);
  });

  it('poisonOnHit poisons the target; dotDuration cuts the poison on its wearer', () => {
    const rules = { ...steady, maxRounds: 5 };
    const dealt = (affixes: Record<string, number>) =>
      bossFight([member('a', affixes, { maxHp: 1e6 })], { damage: 0 }, rules).fight.dealt.a;
    expect(dealt({})).toBeCloseTo(50, 5);
    // One Venomous stack, refreshed each round: the poison ticks at rounds 2-5.
    expect(dealt({ venomous: 100 })).toBeCloseTo(54, 5);
    // Antivenom cuts its wearer's share of the Poison threat's wounds after every fight.
    const poisoned = (affixes: Record<string, number>) =>
      simulateRun([member('a', affixes, { maxHp: 1000, hp: 1000 })], dungeon({ damage: 0, hp: 1 }), 'seed', {
        rules,
        briefing: { threats: [{ id: 'poison', level: 1 }], restriction: null, opportunity: null },
      }).hp[0].hp;
    const lost = 1000 - poisoned({});
    expect(lost).toBeGreaterThan(0);
    expect(1000 - poisoned({ antivenom: 60 })).toBeCloseTo(lost * 0.4, 0);
  });

  it('healOnKill heals a share of max HP on every kill', () => {
    const run = (affixes: Record<string, number>) =>
      bossFight([member('a', affixes, { hp: 40 })], { hp: 30, damage: 5 });
    expect(run({}).run.hp[0].hp).toBe(30);
    expect(run({}).fight.healed).toEqual({});
    expect(run({ bloodthirsty: 5 }).run.hp[0].hp).toBe(35);
    expect(run({ bloodthirsty: 5 }).fight.healed).toEqual({ a: 5 });
  });

  it('fightShield soaks damage first, spent for the fight', () => {
    const rules = { ...steady, maxRounds: 2 };
    const shielded = bossFight([member('a', { bulwark: 8 })], { damage: 50 }, rules);
    expect(shielded.fight.taken.a).toBeCloseTo(42 + 50, 5);
    expect(shielded.run.hp[0].hp).toBe(8);
    const plain = bossFight([member('a')], { damage: 50 }, rules);
    expect(plain.fight.taken.a).toBeCloseTo(100, 5);
    expect(plain.run.hp[0].hp).toBe(0);
  });

  it('firstRoundCrit lifts the first round of each fight', () => {
    const rules = { ...steady, maxRounds: 2 };
    const dealt = (affixes: Record<string, number>) =>
      bossFight([member('a', affixes, { maxHp: 1e6 })], {}, rules).fight.dealt.a;
    expect(dealt({})).toBeCloseTo(20, 5);
    expect(dealt({ opener: 100 })).toBeCloseTo(10 * calm.critMultiplier + 10, 5);
  });

  it('lastStand holds the hero at 1 HP at a would-be fall, once', () => {
    const boss = { damage: 150 };
    const rules = (rounds: number) => ({ ...steady, maxRounds: rounds });
    const plain = bossRun([member('a')], boss, rules(1));
    expect(plain.hp[0].hp).toBe(0);
    expect(plain.encounters.flatMap((e) => e.knockedOut)).toEqual(['a']);
    const held = bossRun([member('a', { unyielding: 100 })], boss, rules(1));
    expect(held.hp[0].hp).toBe(1);
    expect(held.encounters.flatMap((e) => e.knockedOut)).toEqual([]);
    const spent = bossRun([member('a', { unyielding: 100 })], boss, rules(2));
    expect(spent.hp[0].hp).toBe(0);
    expect(spent.encounters.flatMap((e) => e.knockedOut)).toEqual(['a']);
  });

  it('potionHealing lifts the healing consumables used on this hero', () => {
    const rules = { ...steady, maxRounds: 1 };
    const potion = itemById.healingPotion as ConsumableDef;
    const run = (affixes: Record<string, number>) =>
      bossRun([member('a', affixes, { hp: 30, consumable: potion })], { damage: 20 }, rules);
    expect(run({}).hp[0].hp).toBeCloseTo(10 + 30, 5);
    expect(run({ potionAffinity: 20 }).hp[0].hp).toBeCloseTo(10 + 36, 5);
  });

  it('plays the same run twice on the same seed', () => {
    const party = [member('a', { hunter: 20, venomous: 15, bulwark: 5, wardingFire: 10 }, { maxHp: 1000 })];
    const boss: Partial<BossDef> = { damage: 30, element: 'fire', tags: ['beast'] };
    expect(simulateRun(party, dungeon(boss), 'same-seed', { rules: steady })).toEqual(
      simulateRun(party, dungeon(boss), 'same-seed', { rules: steady }),
    );
  });
});
