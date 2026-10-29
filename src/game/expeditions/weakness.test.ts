import { expeditionRules } from '@/content/dungeons';
import { dungeonById, itemById } from '@/content/lookup';
import { threatRules } from '@/content/threats';
import { untriggeredSalvage } from './expeditions';
import { estimatePartyOdds } from './odds';
import { simulateRun, type PartyMember } from './simulate';

import type { BossDef, ConsumableDef, DungeonDef, EncounterDef } from '../types';

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

function dungeon(boss: Partial<BossDef> = {}): DungeonDef {
  const quiet: EncounterDef = { type: 'event', weight: 1, eventId: 'cache' };
  return {
    ...dungeonById.ratCellar,
    encounterCount: [2, 2],
    encounters: [quiet],
    boss: { id: 'testBoss', name: 'test boss', hp: 100, damage: 5, damageType: 'power', speed: 5, tags: [], ...boss },
  };
}

const weaknessItem = (itemId: string): ConsumableDef => itemById[itemId] as ConsumableDef;

/** The run's boss encounter. */
const bossFight = (party: PartyMember[], def: DungeonDef, seed = 's') =>
  simulateRun(party, def, seed, { rules: steady }).encounters.find((e) => e.kind === 'boss')!;

describe('boss weaknesses', () => {
  it('cuts the bandit captain’s HP with the wanted poster', () => {
    const def = dungeon({ id: 'banditCaptain', hp: 300, damage: 10, effect: 'enrage' });
    const carrier = member('a', { maxHp: 1e6, power: 20, consumable: weaknessItem('wantedPoster') });
    const run = simulateRun([carrier], def, 's', { rules: steady });
    const withItem = run.encounters.find((e) => e.kind === 'boss')!;
    const without = bossFight([member('a', { maxHp: 1e6, power: 20 })], def);
    expect(run.weaknessUsedBy).toBe('a');
    expect(withItem.effects).toContainEqual({ heroId: 'a', key: 'weakness' });
    expect(withItem.rounds).toBeLessThan(without.rounds);
    expect(Object.values(withItem.dealt).reduce((s, d) => s + d, 0)).toBeLessThan(
      Object.values(without.dealt).reduce((s, d) => s + d, 0),
    );
  });

  it('cuts the ogre chieftain’s damage with the strong ale', () => {
    const def = dungeon({ id: 'ogreChieftain', hp: 300, damage: 10, effect: 'sweep' });
    const taken = (party: PartyMember[]) =>
      Object.values(bossFight(party, def).taken).reduce((s, t) => s + t, 0);
    const withItem = taken([member('a', { maxHp: 1e6, power: 20, consumable: weaknessItem('strongAle') })]);
    const without = taken([member('a', { maxHp: 1e6, power: 20 })]);
    expect(withItem).toBeCloseTo(without * 0.7);
  });

  it('burns the lich of the deep and never enrages it', () => {
    const def = dungeon({ id: 'lichOfTheDeep', hp: 400, damage: 10, effect: 'enrage' });
    const carrier = member('a', { maxHp: 1e6, power: 20, consumable: weaknessItem('fontWater') });
    const withItem = bossFight([carrier], def);
    const withTaken = Object.values(withItem.taken).reduce((s, t) => s + t, 0);
    // 300 cut HP at 20 damage a round is 15 rounds; no enrage means the full damage each round.
    expect(withItem.rounds).toBe(15);
    expect(withTaken).toBeCloseTo(10 * (withItem.rounds - 1));
    const without = bossFight([member('a', { maxHp: 1e6, power: 20 })], def);
    expect(Object.values(without.taken).reduce((s, t) => s + t, 0)).toBeGreaterThan(10 * (without.rounds - 1));
  });

  it('enrages the bandit captain below half of his cut max HP', () => {
    const def = dungeon({ id: 'banditCaptain', hp: 400, damage: 10, effect: 'enrage' });
    const carrier = member('a', { maxHp: 1e6, power: 20, consumable: weaknessItem('wantedPoster') });
    const fight = bossFight([carrier], def);
    // 300 HP at 20 a round: 15 rounds, and he enrages from round 8 (140 < 150), not round 6 (180 < 200).
    expect(fight.rounds).toBe(15);
    expect(Object.values(fight.taken).reduce((s, t) => s + t, 0)).toBeCloseTo(10 * 7 + 10 * expeditionRules.enrageMultiplier * 7);
  });

  it('puts the giant king to sleep for two free rounds', () => {
    const def = dungeon({ id: 'giantKing', hp: 300, damage: 50, effect: 'sweep' });
    const carrier = member('a', { maxHp: 1e6, power: 150, consumable: weaknessItem('sleepingDraught') });
    const withItem = bossFight([carrier], def);
    expect(withItem.rounds).toBeLessThanOrEqual(2);
    expect(withItem.taken).toEqual({});
    const without = bossFight([member('a', { maxHp: 1e6, power: 150 })], def);
    expect(Object.values(without.taken).reduce((s, t) => s + t, 0)).toBeGreaterThan(0);
  });

  it('keeps the elder dragon off the party’s back with the decoy hoard', () => {
    const def = dungeon({ id: 'elderDragon', hp: 300, damage: 10, effect: 'sweep' });
    const party = ['a', 'b', 'c'].map((id) =>
      member(id, { maxHp: 1e6, power: 20, consumable: id === 'a' ? weaknessItem('decoyHoard') : null }),
    );
    const withItem = bossFight(party, def);
    const withTaken = Object.values(withItem.taken).reduce((s, t) => s + t, 0);
    const without = bossFight(
      ['a', 'b', 'c'].map((id) => member(id, { maxHp: 1e6, power: 20 })),
      def,
    );
    const withoutTaken = Object.values(without.taken).reduce((s, t) => s + t, 0);
    // A sweep lands 0.6 of the damage on all three heroes; without it the boss hits one for the full damage.
    expect(withTaken).toBeCloseTo(withoutTaken * (10 / (3 * 6)));
    expect(Object.keys(without.taken)).toHaveLength(3);
  });

  it('does nothing against another boss, and the copy is salvaged', () => {
    const carrier = member('a', { maxHp: 1e6, power: 20, consumable: weaknessItem('wantedPoster') });
    const run = simulateRun([carrier], dungeon({ id: 'testBoss', hp: 300 }), 's', { rules: steady });
    expect(run.weaknessUsedBy).toBeNull();
    expect(run.encounters.find((e) => e.kind === 'boss')!.effects).not.toContainEqual({ heroId: 'a', key: 'weakness' });
    const salvaged = untriggeredSalvage([carrier], run, { barren: false, gold: 10 });
    expect(salvaged).toEqual([{ heroId: 'a', itemId: 'wantedPoster', materials: [], gold: threatRules.salvageGold }]);
  });

  it('uses only the first carrier’s copy; the other is salvaged', () => {
    const first = member('a', { maxHp: 1e6, power: 20, consumable: weaknessItem('wantedPoster') });
    const second = member('b', { maxHp: 1e6, power: 20, consumable: weaknessItem('wantedPoster') });
    const run = simulateRun([first, second], dungeon({ id: 'banditCaptain', hp: 300 }), 's', { rules: steady });
    expect(run.weaknessUsedBy).toBe('a');
    const salvaged = untriggeredSalvage([first, second], run, { barren: false, gold: 10 });
    expect(salvaged).toEqual([{ heroId: 'b', itemId: 'wantedPoster', materials: [], gold: threatRules.salvageGold }]);
  });

  it('salvages the copy when the party never reaches the boss', () => {
    const carrier = member('a', { maxHp: 1, power: 1, consumable: weaknessItem('wantedPoster') });
    const run = simulateRun([carrier], dungeonById.banditStockade, 's', { rules: calm });
    expect(run.bossDefeated).toBe(false);
    expect(run.weaknessUsedBy).toBeNull();
    const salvaged = untriggeredSalvage([carrier], run, { barren: false, gold: 10 });
    expect(salvaged).toEqual([{ heroId: 'a', itemId: 'wantedPoster', materials: [], gold: threatRules.salvageGold }]);
  });

  it('lifts the party’s odds against the matching boss', () => {
    const base = ['a', 'b', 'c'].map((id) => member(id, { maxHp: 70, power: 15 }));
    const def = dungeonById.banditStockade;
    const without = estimatePartyOdds(base, def, 100, { rules: calm });
    const withItem = estimatePartyOdds(
      base.map((m, i) => (i === 0 ? { ...m, consumable: weaknessItem('wantedPoster') } : m)),
      def,
      100,
      { rules: calm },
    );
    expect(withItem.success).toBeGreaterThan(without.success);
  });
});
