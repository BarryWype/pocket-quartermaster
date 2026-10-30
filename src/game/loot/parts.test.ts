import { monsterParts } from '@/content/loot/monsterParts';
import { lootMatrix } from '@/content/loot/matrix';
import { ELEMENTS, shardId } from '@/game/elements';

import { createRng } from '../generation/rng';
import { partWeights } from './parts';
import { rollSourceLoot } from './roll';
import type { LootRequest } from './roll';
import { LOOT_SOURCES, type Loot, type LootSourceId } from './types';

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

describe('monster part weights', () => {
  it('gives a single-family mob its family part, double-weighted', () => {
    expect(partWeights(['goblin'], undefined)).toEqual([{ materialId: 'goblinEar', weight: 2 }]);
  });

  it("counts the mob's first family double", () => {
    expect(partWeights(['cellarSpider'], undefined)).toEqual([
      { materialId: 'venomSac', weight: 2 },
      { materialId: 'fangOrHorn', weight: 1 },
    ]);
  });

  it('turns elemental mobs into their element shard', () => {
    expect(partWeights(['fireImp'], undefined)).toEqual([{ materialId: 'fireShard', weight: 2 }]);
  });

  it('falls back to every part at weight 1 with no enemies', () => {
    const weights = partWeights([], undefined);
    expect(weights).toEqual(monsterParts.map((part) => ({ materialId: part.id, weight: 1 })));
    expect(weights).toHaveLength(12);
  });

  it('sums weights across repeated enemies, first-seen order', () => {
    expect(partWeights(['goblin', 'cellarSpider', 'goblin'], undefined)).toEqual([
      { materialId: 'goblinEar', weight: 4 },
      { materialId: 'venomSac', weight: 2 },
      { materialId: 'fangOrHorn', weight: 1 },
    ]);
  });

  it('drops 1-2 parts off an always source and 2-3 elsewhere', () => {
    const alwaysSource = LOOT_SOURCES.find(
      (source) => lootMatrix[source].marks.monsterParts === 'A',
    );
    const otherSource = LOOT_SOURCES.find(
      (source) => lootMatrix[source].marks.monsterParts !== 'A' && lootMatrix[source].marks.monsterParts !== '—',
    );
    expect(alwaysSource).toBeDefined();
    expect(otherSource).toBeDefined();

    const partIds = new Set(monsterParts.map((part) => part.id));
    const shardIds = new Set(ELEMENTS.map((element) => shardId(element)));
    const rolled = (source: LootSourceId, seeds: number): Loot[] =>
      Array.from({ length: seeds }, (_, i) =>
        rollSourceLoot(request(source, `parts${i}`, { force: 'monsterParts', enemies: ['goblin'] })),
      );

    for (const loot of rolled(otherSource!, 60)) {
      const parts = loot.materials.filter((stack) => !shardIds.has(stack.materialId));
      expect(parts).toHaveLength(1);
      expect(partIds.has(parts[0].materialId)).toBe(true);
      expect(parts[0].amount).toBeGreaterThanOrEqual(1);
      expect(parts[0].amount).toBeLessThanOrEqual(2);
    }
    for (const loot of rolled(alwaysSource!, 60)) {
      const parts = loot.materials.filter((stack) => !shardIds.has(stack.materialId));
      expect(parts).toHaveLength(1);
      expect(partIds.has(parts[0].materialId)).toBe(true);
      expect(parts[0].amount).toBeGreaterThanOrEqual(2);
      expect(parts[0].amount).toBeLessThanOrEqual(3);
    }
  });
});
