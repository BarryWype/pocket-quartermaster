import { itemById } from '@/content/lookup';
import { QUALITIES } from '@/content/forging';
import { newHero } from '@/content/heroes';
import { trinketKinds, trinketId } from '@/content/trinkets';
import type { GearDef } from '@/game/types';

import { createInitialSave, type SaveData } from '../save';
import { createRng } from '../generation/rng';
import { approachScore, gearApproachBonus } from '../team/stats';
import { equip } from '../team/team';
import { rollLootTrinket, trinketEffect } from './trinkets';
import type { LootRequest } from './roll';
import type { LootSourceId } from './types';

const context = (playerTier: number) => ({
  playerTier,
  pickaxeTier: 3,
  knownRecipes: [] as string[],
  favourCounts: {},
  mastery: {},
});

const request = (source: LootSourceId, seed: string, overrides: Partial<LootRequest> = {}): LootRequest => ({
  source,
  tier: 3,
  enemies: [],
  base: { gold: 0, xp: 0 },
  context: context(3),
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
  ...overrides,
});

const trinket = (kind: string, tier: number): GearDef => itemById[trinketId(kind, tier)] as GearDef;

/** Values by quality, crappy → legendary. */
const byQuality = (item: GearDef, pick: (effect: ReturnType<typeof trinketEffect>) => number) =>
  QUALITIES.map((quality) => pick(trinketEffect(item, quality)));

describe('the trinket catalogue', () => {
  it('holds one trinket per kind and tier, all in the trinket slot', () => {
    expect(trinketKinds).toHaveLength(14);
    expect(trinketKinds.flatMap((kind) => [1, 2, 3, 4, 5].map((tier) => trinketId(kind.kind, tier)))).toHaveLength(70);
    for (const id of trinketKinds.flatMap((kind) => [1, 2, 3, 4, 5].map((tier) => trinketId(kind.kind, tier)))) {
      expect(itemById[id].slot).toBe('trinket');
    }
  });

  it('scales the stat trinkets with quality and tier', () => {
    expect(byQuality(trinket('hawkEyeRing', 1), (e) => e.stats.crit!)).toEqual([3, 4, 4, 5, 5]);
    expect(byQuality(trinket('hawkEyeRing', 2), (e) => e.stats.crit!)).toEqual([5, 6, 6, 6, 7]);
    expect(byQuality(trinket('hawkEyeRing', 3), (e) => e.stats.crit!)).toEqual([6, 7, 7, 8, 9]);
    expect(byQuality(trinket('hawkEyeRing', 4), (e) => e.stats.crit!)).toEqual([7, 8, 9, 9, 10]);
    expect(byQuality(trinket('hawkEyeRing', 5), (e) => e.stats.crit!)).toEqual([8, 10, 10, 11, 12]);

    expect(byQuality(trinket('shadowPin', 1), (e) => e.stats.evasion!)).toEqual([3, 3, 3, 3, 4]);
    expect(byQuality(trinket('shadowPin', 2), (e) => e.stats.evasion!)).toEqual([4, 4, 4, 5, 5]);
    expect(byQuality(trinket('shadowPin', 3), (e) => e.stats.evasion!)).toEqual([4, 5, 5, 6, 7]);
    expect(byQuality(trinket('shadowPin', 4), (e) => e.stats.evasion!)).toEqual([5, 6, 6, 7, 8]);
    expect(byQuality(trinket('shadowPin', 5), (e) => e.stats.evasion!)).toEqual([6, 7, 8, 8, 9]);

    expect(byQuality(trinket('quicksilverAnklet', 1), (e) => e.stats.speed!)).toEqual([1, 1, 1, 1, 1]);
    expect(byQuality(trinket('quicksilverAnklet', 2), (e) => e.stats.speed!)).toEqual([1, 1, 1, 2, 2]);
    expect(byQuality(trinket('quicksilverAnklet', 3), (e) => e.stats.speed!)).toEqual([1, 2, 2, 2, 2]);
    expect(byQuality(trinket('quicksilverAnklet', 4), (e) => e.stats.speed!)).toEqual([2, 2, 2, 2, 3]);
    expect(byQuality(trinket('quicksilverAnklet', 5), (e) => e.stats.speed!)).toEqual([2, 2, 3, 3, 3]);
  });

  it('scales the amulets with quality and the resistance curve', () => {
    expect(byQuality(trinket('fireAmulet', 1), (e) => e.elementResist!.amount)).toEqual([3, 4, 4, 5, 5]);
    expect(byQuality(trinket('fireAmulet', 2), (e) => e.elementResist!.amount)).toEqual([6, 8, 8, 9, 10]);
    expect(byQuality(trinket('fireAmulet', 3), (e) => e.elementResist!.amount)).toEqual([10, 12, 13, 14, 16]);
    expect(byQuality(trinket('fireAmulet', 4), (e) => e.elementResist!.amount)).toEqual([14, 17, 18, 19, 22]);
    expect(byQuality(trinket('fireAmulet', 5), (e) => e.elementResist!.amount)).toEqual([19, 22, 24, 26, 29]);
  });

  it('leaves the ring of fortune Luck flat and gives talismans their approach', () => {
    expect(byQuality(trinket('ringOfFortune', 1), (e) => e.stats.luck!)).toEqual([2, 2, 2, 2, 2]);
    expect(byQuality(trinket('ringOfFortune', 3), (e) => e.stats.luck!)).toEqual([3, 3, 3, 3, 3]);
    expect(byQuality(trinket('ringOfFortune', 5), (e) => e.stats.luck!)).toEqual([4, 4, 4, 4, 4]);
    expect(trinketEffect(trinket('oxTalisman', 2), 'rare')).toEqual({ stats: {}, approach: 'might' });
  });
});

describe('looted trinkets', () => {
  it('only drops the ring of fortune on a Legendary roll, and never from goblin patrols', () => {
    const rolls = (source: LootSourceId) =>
      Array.from({ length: 3000 }, (_, i) => rollLootTrinket(request(source, `${source}${i}`)));
    for (const piece of rolls('tierBoss')) {
      if (piece.itemId.startsWith('ringOfFortune')) expect(piece.quality).toBe('legendary');
    }
    expect(rolls('patrolGoblins').some((piece) => piece.itemId.startsWith('ringOfFortune'))).toBe(false);
  });

  it('shares the talismans between 10% and 25% of non-legendary rolls', () => {
    const rolls = [...Array.from({ length: 3000 }, (_, i) => rollLootTrinket(request('tierBoss', `b${i}`))),
      ...Array.from({ length: 3000 }, (_, i) => rollLootTrinket(request('patrolGoblins', `p${i}`)))];
    const plain = rolls.filter((piece) => piece.quality !== 'legendary');
    const talismans = plain.filter((piece) => piece.itemId.includes('Talisman')).length;
    expect(talismans / plain.length).toBeGreaterThan(0.1);
    expect(talismans / plain.length).toBeLessThan(0.25);
  });

  it('uses the request element for an amulet', () => {
    const rolls = Array.from({ length: 300 }, (_, i) => rollLootTrinket(request('tierBoss', `f${i}`, { element: 'fire' })));
    const amulets = rolls.filter((piece) => piece.itemId.includes('Amulet'));
    expect(amulets.length).toBeGreaterThan(0);
    for (const piece of amulets) expect(piece.itemId).toMatch(/^fireAmulet\d$/);
  });

  it('follows the gear tier rules', () => {
    for (const piece of Array.from({ length: 50 }, (_, i) => rollLootTrinket(request('dungeonRun', `d${i}`, { tier: 4 })))) {
      expect(piece.itemId).toMatch(/4$/);
      expect(piece.uid).toBe('');
    }
  });
});

describe('trinkets on a hero', () => {
  const saveWithTalisman = (hero = createInitialSave().heroes.find((h) => h.id === 'bram')!): SaveData => {
    const base = createInitialSave();
    const save: SaveData = { ...base, heroes: [...base.heroes.filter((h) => h.id !== hero.id), hero], gear: [{ uid: 't1', itemId: 'oxTalisman1', quality: 'normal' }] };
    return equip(save, hero.id, 'trinket', 't1');
  };

  it('adds the talisman approach, capped at 5', () => {
    const atCap = { ...newHero('cap', 'Cap', 'barbarian', 'resilient'), approachPicks: ['might' as const] };
    const capped = saveWithTalisman(atCap);
    const fromCap = capped.heroes.find((h) => h.id === 'cap')!;
    expect(approachScore(fromCap, 'might', gearApproachBonus(capped, fromCap))).toBe(5);

    const plain = saveWithTalisman();
    const bram = plain.heroes.find((h) => h.id === 'bram')!;
    expect(approachScore(bram, 'might', gearApproachBonus(plain, bram))).toBe(4);
  });
});
