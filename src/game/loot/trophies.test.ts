import { mobById, patrolMobId } from '@/content/enemies';
import { lootConfig } from '@/content/loot/config';
import { lootMatrix } from '@/content/loot/matrix';
import { monsterParts } from '@/content/loot/monsterParts';
import { relicById } from '@/content/lookup';
import { ELEMENTS, stoneId } from '@/game/elements';

import { familyTags } from '../enemies/tags';
import { createRng } from '../generation/rng';
import { generators } from './generators';
import type { LootRequest } from './roll';
import { emptyLoot, type Loot, type LootSourceId } from './types';

const request = (source: LootSourceId, seed: string, overrides: Partial<LootRequest> = {}): LootRequest => ({
  source,
  tier: 3,
  enemies: [],
  base: { gold: 0, xp: 0 },
  context: { playerTier: 3, pickaxeTier: 3, knownRecipes: [], favourCounts: {} },
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
  ...overrides,
});

const trophy = (req: LootRequest): Loot => {
  const loot = emptyLoot();
  generators.trophies(req, loot);
  return loot;
};

const partOf = (mobId: string) => monsterParts.find((part) => part.tag === familyTags(mobById[mobId])[0])!.id;

describe('trophies', () => {
  it('gives a tier boss a relic of its tier', () => {
    for (let i = 0; i < 20; i++) {
      const loot = trophy(request('tierBoss', `boss-${i}`, { enemies: ['ogreChieftain'] }));
      expect(loot.relics).toHaveLength(1);
      expect(relicById[loot.relics[0]].tier).toBe(3);
      expect(loot.materials).toEqual([]);
    }
  });

  it("gives 2-3 monster parts of an elite's family, before the other enemies'", () => {
    const elite = patrolMobId('herd', 1, 'weak', true);
    const plain = patrolMobId('goblins', 1, 'weak');
    expect(partOf(elite)).not.toBe(partOf(plain));
    for (let i = 0; i < 20; i++) {
      const loot = trophy(request('monsterLair', `lair-${i}`, { enemies: [plain, elite, plain] }));
      expect(loot.relics).toEqual([]);
      expect(loot.materials).toHaveLength(1);
      expect(loot.materials[0].materialId).toBe(partOf(elite));
      const [min, max] = lootConfig.trophies.parts;
      expect(loot.materials[0].amount).toBeGreaterThanOrEqual(min);
      expect(loot.materials[0].amount).toBeLessThanOrEqual(max);
    }
  });

  it('gives an elemental stone of the source element at rifts and sanctums', () => {
    expect(trophy(request('elementalRift', 'rift', { element: 'fire' })).materials).toEqual([{ materialId: stoneId('fire'), amount: 1 }]);
    const sanctum = trophy(request('sanctum', 'sanctum')).materials;
    expect(ELEMENTS.map(stoneId)).toContain(sanctum[0].materialId);
  });

  it('configures a trophy for every source with a Trophies mark', () => {
    const marked = (Object.keys(lootMatrix) as LootSourceId[]).filter((source) => lootMatrix[source].marks.trophies !== '—');
    expect(Object.keys(lootConfig.trophies.bySource).sort()).toEqual(marked.sort());
  });
});
