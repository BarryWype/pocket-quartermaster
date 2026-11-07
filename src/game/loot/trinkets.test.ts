import { lootConfig } from '@/content/loot/config';
import { itemById } from '@/content/lookup';
import { gearRules } from '@/content/gear';
import { trinketKinds, trinketId } from '@/content/trinkets';
import type { GearDef } from '@/game/types';

import { createRng } from '../generation/rng';
import { rollLootTrinket, trinketEffect } from './trinkets';
import type { LootRequest } from './roll';
import type { LootSourceId } from './types';

const context = (playerTier: number) => ({
  playerTier,
  pickaxeTier: 3,
  knownRecipes: [] as string[],
  favourCounts: {},
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

/** Values at the lowest, middle and highest dice total of a Common piece, then the top of a Legendary one. */
const byRoll = (item: GearDef, pick: (effect: ReturnType<typeof trinketEffect>) => number) =>
  [3, 10, 18].map((roll) => pick(trinketEffect(item, { roll, rarity: 'common' }))).concat(
    pick(trinketEffect(item, { roll: 16, rarity: 'legendary' })),
  );

describe('the trinket catalogue', () => {
  it('holds one trinket per kind and tier, all in the trinket slot', () => {
    expect(trinketKinds).toHaveLength(9);
    expect(trinketKinds.flatMap((kind) => [1, 2, 3, 4, 5].map((tier) => trinketId(kind.kind, tier)))).toHaveLength(45);
    for (const id of trinketKinds.flatMap((kind) => [1, 2, 3, 4, 5].map((tier) => trinketId(kind.kind, tier)))) {
      expect(itemById[id].slot).toBe('trinket');
    }
  });

  it('scales the stat trinkets and amulets with the dice factor', () => {
    for (const [kind, pick] of [
      ['hawkEyeRing', (e: ReturnType<typeof trinketEffect>) => e.stats.crit!],
      ['shadowPin', (e: ReturnType<typeof trinketEffect>) => e.stats.evasion!],
      ['fireAmulet', (e: ReturnType<typeof trinketEffect>) => e.elementResist!.amount],
    ] as const) {
      for (const tier of [1, 3, 5]) {
        const item = trinket(kind, tier);
        const base = kind === 'fireAmulet' ? item.elementResist!.amount : (item.stats.crit ?? item.stats.evasion)!;
        const [low, mid, high, legendary] = byRoll(item, pick);
        expect(low).toBe(Math.round(base * gearRules.statRange.min));
        expect(high).toBe(Math.round(base * gearRules.statRange.max));
        expect(low).toBeLessThanOrEqual(mid);
        expect(mid).toBeLessThanOrEqual(high);
        expect(legendary).toBe(high);
      }
    }
  });

  it('leaves the ring of fortune Luck flat', () => {
    expect(byRoll(trinket('ringOfFortune', 1), (e) => e.stats.luck!)).toEqual([2, 2, 2, 2]);
    expect(byRoll(trinket('ringOfFortune', 3), (e) => e.stats.luck!)).toEqual([3, 3, 3, 3]);
    expect(byRoll(trinket('ringOfFortune', 5), (e) => e.stats.luck!)).toEqual([4, 4, 4, 4]);
  });
});

describe('looted trinkets', () => {
  it('only drops the ring of fortune on a Legendary roll, rarely from patrols', () => {
    const rolls = (source: LootSourceId) =>
      Array.from({ length: 3000 }, (_, i) => rollLootTrinket(request(source, `${source}${i}`)));
    for (const piece of rolls('tierBoss')) {
      if (piece.itemId.startsWith('ringOfFortune')) expect(piece.rarity).toBe('legendary');
    }
    // Patrols reach Legendary only through the basic upgrade roll.
    const patrolRings = rolls('patrol').filter((piece) => piece.itemId.startsWith('ringOfFortune')).length;
    expect(patrolRings / 3000).toBeLessThan(lootConfig.gearRarity.upgrades.basic!.legendary);
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
