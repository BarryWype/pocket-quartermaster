import { recipeById } from '@/content/lookup';

import { createInitialSave } from '../save';
import { forgeList } from './forgeList';
import { startingRecipes } from './recipeUnlocks';

describe('forgeList', () => {
  it('lists the starting blueprints at tier 1 and nothing above', () => {
    const { tiers, plainRecipeIds } = forgeList(createInitialSave());
    expect(tiers[0].recipeIds).toEqual(startingRecipes);
    expect(tiers.slice(1).map(({ recipeIds }) => recipeIds)).toEqual([[], [], [], []]);
    // A fresh save knows no tools or smelting either: they are taught by play.
    expect(plainRecipeIds).toEqual([]);
  });

  it('lists only the known blueprints of each tier', () => {
    const save = {
      ...createInitialSave(),
      knownRecipes: [...startingRecipes, 'bow2', 'axe3', 'plate3'],
    };
    const { tiers } = forgeList(save);
    expect(tiers[0].recipeIds).toEqual(startingRecipes);
    expect(tiers[1].recipeIds).toEqual(['bow2']);
    expect(tiers[2].recipeIds).toEqual(['axe3', 'plate3']);
    expect(tiers[3].recipeIds).toEqual([]);
    expect(tiers[4].recipeIds).toEqual([]);
  });

  it('shows no gear blueprints when none are known, keeping the no-blueprint recipes', () => {
    const save = { ...createInitialSave(), knownRecipes: ['woodPickaxe', 'smeltSteel'] };
    const { tiers, plainRecipeIds } = forgeList(save);
    expect(tiers.map(({ recipeIds }) => recipeIds)).toEqual([[], [], [], [], []]);
    // Tools and smelting need no blueprint: once taught they show whatever the gear tiers hold.
    expect(plainRecipeIds).toEqual(['woodPickaxe', 'smeltSteel']);
    expect(plainRecipeIds.every((id) => recipeById[id].station === 'forge')).toBe(true);
  });
});
