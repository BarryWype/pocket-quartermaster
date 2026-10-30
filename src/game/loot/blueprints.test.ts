import { gearId, gearRecipes } from '@/content/equipment';
import { lootConfig } from '@/content/loot/config';
import { masteryCap } from '@/game/forging/mastery';
import type { GearType, MasteryType } from '@/game/types';

import { createInitialSave } from '../save';
import { createRng } from '../generation/rng';
import { grantLoot } from './grant';
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
  context: { playerTier: 5, pickaxeTier: 5, knownRecipes: [], favourCounts: {}, mastery: {}, ...context },
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
    expect(tierTypes.reduce((sum, types) => sum + types.length, 0)).toBe(110);
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

  it('gives mastery progress when the tier is complete, preferring uncapped types', () => {
    const tier = 2;
    const types = forgeableAt(tier);
    const known = types.map((type) => gearId(type, tier));
    const loot = blueprint(request('complete', tier, { knownRecipes: known }));
    expect(loot.recipeIds).toEqual([]);
    expect(loot.mastery).toEqual([{ type: expect.any(String), tier, forges: 2 }]);

    const cap = masteryCap(tier);
    const uncapped = types[0];
    const mastery = Object.fromEntries(
      types.filter((type) => type !== uncapped).map((type) => [type, { level: cap, progress: 0 }]),
    ) as Partial<Record<MasteryType, { level: number; progress: number }>>;
    const preferred = blueprint(request('preferred', tier, { knownRecipes: known, mastery }));
    expect(preferred.mastery).toEqual([{ type: uncapped, tier, forges: 2 }]);

    const capped = Object.fromEntries(types.map((type) => [type, { level: cap, progress: 0 }])) as Partial<
      Record<MasteryType, { level: number; progress: number }>
    >;
    const fallback = blueprint(request('fallback', tier, { knownRecipes: known, mastery: capped }));
    expect(types).toContain(fallback.mastery[0].type);
  });

  it('hands over to the components generator when componentShare pays out', () => {
    const tier = 2;
    const known = forgeableAt(tier).map((type) => gearId(type, tier));
    const share = lootConfig.blueprints.componentShare;
    const original = generators.components;
    lootConfig.blueprints.componentShare = 1;
    generators.components = jest.fn();
    try {
      const loot = blueprint(request('component', tier, { knownRecipes: known }));
      expect(generators.components).toHaveBeenCalledWith(expect.anything(), loot);
      expect(loot.mastery).toEqual([]);
    } finally {
      lootConfig.blueprints.componentShare = share;
      generators.components = original;
    }
  });

  it('grantLoot applies mastery entries, respecting the tier cap', () => {
    const save = createInitialSave();
    const withProgress = grantLoot(save, [], { ...emptyLoot(), mastery: [{ type: 'sword', tier: 1, forges: 2 }] }, 0);
    expect(withProgress.mastery.sword).toEqual({ level: 1, progress: 2 });

    const capped = { ...save, mastery: { ...save.mastery, sword: { level: masteryCap(1), progress: 0 } } };
    const after = grantLoot(capped, [], { ...emptyLoot(), mastery: [{ type: 'sword', tier: 1, forges: 2 }] }, 0);
    expect(after.mastery.sword).toEqual({ level: masteryCap(1), progress: 0 });
  });
});
