import { recipeById } from '@/content/lookup';
import { dungeons } from '@/content/dungeons';

import { createInitialSave } from '../save';
import { forgeList } from './forgeList';
import { startingRecipes } from './recipeUnlocks';

/** A save that has cleared the tier bosses up to `tier`, so the tiers up to it are unlocked. */
const saveUpTo = (tier: number) => ({
  ...createInitialSave(),
  clearedDungeons: dungeons.filter((d) => d.isBoss && d.tier < tier).map((d) => d.id),
});

describe('forgeList', () => {
  it('lists the starting blueprints at tier 1 and nothing above', () => {
    const { tiers, plainRecipeIds } = forgeList(createInitialSave());
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toEqual({ tier: 1, recipeIds: startingRecipes });
    // A fresh save knows no tools or smelting either: they are taught by play.
    expect(plainRecipeIds).toEqual([]);
  });

  it('hides the tiers above the highest unlocked tier, even with known blueprints', () => {
    const save = { ...saveUpTo(2), knownRecipes: [...startingRecipes, 'bow2', 'axe3'] };
    const { tiers, plainRecipeIds } = forgeList(save);
    expect(tiers.map(({ tier }) => tier)).toEqual([1, 2]);
    expect(tiers[1].recipeIds).toEqual(['bow2']);
    expect(plainRecipeIds).not.toContain('smeltSteel');
  });

  it('lists only the known blueprints of each unlocked tier', () => {
    const save = { ...saveUpTo(3), knownRecipes: [...startingRecipes, 'bow2', 'axe3', 'plate3'] };
    const { tiers } = forgeList(save);
    expect(tiers[0].recipeIds).toEqual(startingRecipes);
    expect(tiers[1].recipeIds).toEqual(['bow2']);
    expect(tiers[2].recipeIds).toEqual(['axe3', 'plate3']);
  });

  it('shows no gear blueprints when none are known, keeping the no-blueprint recipes', () => {
    const save = { ...createInitialSave(), knownRecipes: ['woodPickaxe', 'smeltSteel'] };
    const { tiers, plainRecipeIds } = forgeList(save);
    expect(tiers.map(({ recipeIds }) => recipeIds)).toEqual([[]]);
    // Tools and smelting need no blueprint: once taught they show whatever the gear tiers hold.
    expect(plainRecipeIds).toEqual(['woodPickaxe']);
    expect(plainRecipeIds.every((id) => recipeById[id].station === 'forge')).toBe(true);
  });
});
