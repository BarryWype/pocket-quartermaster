import { lootMatrix } from '@/content/loot/matrix';
import { components } from '@/content/loot/components';
import { ELEMENTS, shardId } from '@/game/elements';

import { createRng } from '../generation/rng';
import { rollSourceLoot } from './roll';
import type { LootRequest } from './roll';
import { LOOT_CATEGORIES, LOOT_SOURCES, type Loot, type LootCategory, type LootSourceId } from './types';

const context = { playerTier: 3, pickaxeTier: 3, knownRecipes: [] as string[], favourCounts: {}, mastery: {} };

const request = (source: LootSourceId, seed: string, overrides: Partial<LootRequest> = {}): LootRequest => ({
  source,
  tier: 3,
  enemies: [],
  base: { gold: 100, xp: 50 },
  context,
  rng: createRng(seed),
  luck: 1000,
  modifiers: [],
  ...overrides,
});

const rolls = (source: LootSourceId, seeds = 200): Loot[] =>
  Array.from({ length: seeds }, (_, i) => rollSourceLoot(request(source, `${source}${i}`)));

describe('rollSourceLoot', () => {
  it("only drops the categories the source's marks allow", () => {
    for (const source of LOOT_SOURCES) {
      const allowed = LOOT_CATEGORIES.filter(
        (category) => lootMatrix[source].marks[category as LootCategory] !== '—',
      );
      for (const loot of rolls(source)) {
        for (const category of loot.dropped) expect(allowed).toContain(category);
      }
    }
  });

  it('forces a category that would never roll', () => {
    const loot = rollSourceLoot(request('dungeonRun', 'f', { force: 'materials', luck: 0 }));
    expect(loot.dropped).toContain('materials');
    expect(loot.materials).toEqual([]);
  });

  it('gives the same loot for the same seed', () => {
    const a = rollSourceLoot(request('monsterLair', 'same'));
    const b = rollSourceLoot(request('monsterLair', 'same'));
    expect(a).toEqual(b);
  });

  it('drops materials only from the sources you walk to', () => {
    const foot: LootSourceId[] = LOOT_SOURCES.filter(
      (source) => lootMatrix[source].marks.materials !== '—',
    );
    const themed: LootSourceId[] = ['patrolGoblins', 'patrolHerd', 'patrolBandits', 'traveller', 'banditCamp', 'goblinRaid', 'beastDen', 'hauntedCrypt', 'abandonedCaravan', 'monsterLair', 'ruinsDig', 'fishingDock', 'treasureSpot', 'stepChest'];
    expect(foot).toEqual(themed);
    const shardIds = ELEMENTS.map((element) => shardId(element));
    // Components live in `materials` too; they drop wherever their mark allows.
    const componentIds = components.map((c) => c.id);
    const notComponent = (stack: { materialId: string }) =>
      !shardIds.includes(stack.materialId) && !componentIds.includes(stack.materialId);
    for (const source of LOOT_SOURCES) {
      const withMaterials = rolls(source).some((loot) => loot.materials.some(notComponent));
      expect(withMaterials).toBe(foot.includes(source));
      if (foot.includes(source)) {
        expect(rolls(source).some((loot) => loot.dropped.includes('materials'))).toBe(true);
      }
    }
    for (const source of LOOT_SOURCES.filter((id) => !foot.includes(id))) {
      expect(lootMatrix[source].marks.materials).toBe('—');
    }
  });
});
