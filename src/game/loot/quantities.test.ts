import { lootConfig } from '@/content/loot/config';
import { components } from '@/content/loot/components';
import { monsterParts } from '@/content/loot/monsterParts';
import { ELEMENTS, shardId } from '@/game/elements';

import { createRng } from '../generation/rng';
import { rollSourceLoot } from './roll';
import type { LootRequest } from './roll';
import type { Loot, LootSourceId } from './types';

const context = { playerTier: 3, pickaxeTier: 3, knownRecipes: [] as string[], favourCounts: {}, mastery: {} };

const request = (source: LootSourceId, seed: string, overrides: Partial<LootRequest> = {}): LootRequest => ({
  source,
  tier: 3,
  enemies: [],
  base: { gold: 100, xp: 50 },
  context,
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
  ...overrides,
});

const partIds = new Set(monsterParts.map((p) => p.id));
/** A forced roll's stacks other than monster parts, which every source with an A or O mark drops too. */
const withoutParts = (loot: Loot) => loot.materials.filter((stack) => !partIds.has(stack.materialId));

const forced = (source: LootSourceId, category: 'materials' | 'shards' | 'treasureMaps' | 'manuals' | 'keyFragments' | 'gold' | 'xp' | 'consumables', seeds = 60): Loot[] =>
  Array.from({ length: seeds }, (_, i) => rollSourceLoot(request(source, `${source}${i}`, { force: category })));

describe('loot quantities', () => {
  it('gives 2-4 of one themed material', () => {
    for (const loot of forced('stepChest', 'materials')) {
      const [stack, ...rest] = withoutParts(loot);
      expect(rest).toEqual([]);
      expect(stack.amount).toBeGreaterThanOrEqual(2);
      expect(stack.amount).toBeLessThanOrEqual(4);
    }
  });

  it('draws caches from the pickaxe-covered resources', () => {
    const pool = ['stone', 'copper', 'iron', 'coal', 'wood'];
    for (const loot of forced('patrolBandits', 'materials')) {
      const [stack, ...rest] = withoutParts(loot);
      expect(rest).toEqual([]);
      expect(pool).toContain(stack.materialId);
      expect(stack.amount).toBeGreaterThanOrEqual(2);
      expect(stack.amount).toBeLessThanOrEqual(4);
    }
  });

  it('gives 2-4 shards of one element', () => {
    const componentIds = new Set(components.map((c) => c.id));
    for (const loot of forced('sanctum', 'shards')) {
      const stacks = loot.materials.filter((stack) => !componentIds.has(stack.materialId));
      expect(stacks.length).toBe(1);
      const [stack] = stacks;
      expect(Object.values(ELEMENTS).map((element) => shardId(element))).toContain(stack.materialId);
      expect(stack.amount).toBeGreaterThanOrEqual(2);
      expect(stack.amount).toBeLessThanOrEqual(4);
    }
  });

  it('gives one map, manual and key fragment per drop', () => {
    for (const loot of forced('dungeonRun', 'treasureMaps')) {
      expect(loot.treasureMaps.length).toBe(1);
      expect(loot.treasureMaps[0].tier).toBe(3);
      expect(['common', 'rare', 'legendary']).toContain(loot.treasureMaps[0].rarity);
    }
    for (const loot of forced('dungeonRun', 'manuals')) {
      expect(loot.manuals).toHaveLength(1);
    }
    for (const loot of forced('dungeonRun', 'keyFragments')) {
      expect(loot.keyFragments).toBe(1);
    }
  });

  it('scales gold with Luck but not xp', () => {
    const withLuck = rollSourceLoot(request('dungeonRun', 'g', { force: 'gold', luck: 10 }));
    expect(withLuck.gold).toBe(150);
    expect(
      rollSourceLoot(request('dungeonRun', 'g', { force: 'gold', luck: 0 })).gold,
    ).toBe(100);
    expect(rollSourceLoot(request('dungeonRun', 'g', { force: 'xp', luck: 10 })).xp).toBe(50);
  });

  it("picks one consumable the player's tier covers", () => {
    const ids = lootConfig.consumables.map((entry) => entry.itemId);
    let lures = 0;
    for (const loot of forced('dungeonRun', 'consumables')) {
      if (loot.lures > 0) {
        lures += 1;
        expect(loot.consumables).toHaveLength(0);
        continue;
      }
      expect(loot.consumables).toHaveLength(1);
      expect(ids).toContain(loot.consumables[0].itemId);
      expect(loot.consumables[0].amount).toBe(1);
    }
    expect(lures).toBeGreaterThan(0);
  });

  it('scales treasure spot gold by map rarity', () => {
    const common = rollSourceLoot(request('treasureSpot', 't', { force: 'gold', mapRarity: 'common' }));
    const legendary = rollSourceLoot(request('treasureSpot', 't', { force: 'gold', mapRarity: 'legendary' }));
    expect(common.gold).toBe(100);
    expect(legendary.gold).toBe(250);
  });
});
