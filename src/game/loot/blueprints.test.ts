import { gearId, gearRecipes } from '@/content/equipment';
import { lootConfig } from '@/content/loot/config';
import { monsterParts } from '@/content/loot/monsterParts';
import type { GearType } from '@/game/types';

import { createRng } from '../generation/rng';
import { generators } from './generators';
import type { LootContext, LootRequest } from './roll';
import { emptyLoot, type Loot, type LootSourceId } from './types';

const forgeableAt = (tier: number): GearType[] =>
  (Object.keys(gearRecipes) as GearType[]).filter((type) => gearRecipes[type][tier - 1].length > 0);

const request = (seed: string, tier: number, context: Partial<LootContext> = {}): LootRequest => ({
  source: 'dungeonRun' as LootSourceId,
  tier,
  enemies: [],
  base: { gold: 0, xp: 0 },
  context: { playerTier: 5, pickaxeTier: 5, knownRecipes: [], favourCounts: {}, ...context },
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
});

const blueprint = (req: LootRequest): Loot => {
  const loot = emptyLoot();
  generators.blueprints(req, loot);
  return loot;
};

describe('blueprints', () => {
  it('never drops a duplicate, always at the source tier, and completes every forgeable type exactly once', () => {
    const tierTypes = [1, 2, 3, 4, 5].map(forgeableAt);
    expect(tierTypes.reduce((sum, types) => sum + types.length, 0)).toBe(135);
    for (const [index, types] of tierTypes.entries()) {
      const tier = index + 1;
      const known: string[] = [];
      const found = new Set<string>();
      for (let i = 0; found.size < types.length && i < types.length * 20; i++) {
        const loot = blueprint(request(`tier${tier}-${i}`, tier, { knownRecipes: known }));
        const [id] = loot.recipeIds;
        expect(id).toBeDefined();
        expect(known).not.toContain(id);
        expect(id.endsWith(String(tier))).toBe(true);
        known.push(id);
        found.add(id);
      }
      expect(found.size).toBe(types.length);
      expect([...found].sort()).toEqual(types.map((type) => gearId(type, tier)).sort());
    }
  });

  const weightedPick = (favourCount: number): number => {
    const tier = 2;
    const [a, b] = forgeableAt(tier);
    const known = forgeableAt(tier)
      .filter((type) => type !== a && type !== b)
      .map((type) => gearId(type, tier));
    let picks = 0;
    for (let i = 0; i < 3000; i++) {
      const loot = blueprint(request(`weight-${favourCount}-${i}`, tier, { knownRecipes: known, favourCounts: { [a]: favourCount } }));
      if (loot.recipeIds[0] === gearId(a, tier)) picks += 1;
    }
    return picks / 3000;
  };

  it('weights the pick by how many heroes favour the type', () => {
    expect(Math.abs(weightedPick(1) - 2 / 3)).toBeLessThan(0.04);
    expect(Math.abs(weightedPick(2) - 3 / 4)).toBeLessThan(0.04);
    expect(Math.abs(weightedPick(5) - 3 / 4)).toBeLessThan(0.04);
  });

  it('gives monster parts of the enemies when the tier is complete', () => {
    const tier = 2;
    const known = forgeableAt(tier).map((type) => gearId(type, tier));
    const loot = blueprint({ ...request('overflow', tier, { knownRecipes: known }), enemies: ['giantRat', 'giantRat'] });
    expect(loot.recipeIds).toEqual([]);
    expect(loot.gold).toBe(0);
    expect(loot.materials).toHaveLength(1);
    expect(monsterParts.some((part) => part.id === loot.materials[0].materialId)).toBe(true);
    expect(loot.materials[0].amount).toBeGreaterThanOrEqual(lootConfig.blueprints.overflowParts[0]);
    expect(loot.materials[0].amount).toBeLessThanOrEqual(lootConfig.blueprints.overflowParts[1]);
  });

  it('gives gold on a complete tier when the source had no enemies', () => {
    const tier = 3;
    const known = forgeableAt(tier).map((type) => gearId(type, tier));
    const loot = blueprint(request('overflow-gold', tier, { knownRecipes: known }));
    expect(loot.recipeIds).toEqual([]);
    expect(loot.materials).toEqual([]);
    expect(loot.gold).toBe(Math.round(lootConfig.blueprints.overflowGold * lootConfig.goldByTier[tier - 1]));
  });
});
