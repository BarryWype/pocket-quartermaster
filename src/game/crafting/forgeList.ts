import { itemById, recipeById } from '@/content/lookup';
import { tierMaterials } from '@/content/materials';
import { recipes } from '@/content/recipes';

import type { SaveData } from '../save';
import type { RecipeDef } from '../types';
import { highestUnlockedTier } from '../dungeons/unlock';
import { forgedItem, isKnown } from './crafting';
import { tierRecipes } from './recipeUnlocks';

const TIERS = [1, 2, 3, 4, 5];

/** The tier a recipe belongs to: its tool's tier, or its output material's (wood 1 … steel 5). */
export function recipeTier(recipe: RecipeDef): number {
  if ('itemId' in recipe.output) {
    const item = itemById[recipe.output.itemId];
    return 'tier' in item ? item.tier : 1;
  }
  const index = tierMaterials.indexOf(recipe.output.materialId);
  return index === -1 ? 1 : index + 1;
}

/** The forge's gear blueprints the player knows at one tier. */
export type ForgeTierList = { tier: number; recipeIds: string[] };

/** The forge's craft list: known gear blueprints by tier, and the recipes that need no blueprint. */
export type ForgeList = { tiers: ForgeTierList[]; plainRecipeIds: string[] };

/** What the forge can show: per unlocked tier the gear recipes whose blueprint is known, and the non-gear recipes (tools, smelting) known by default. Tiers the player has not reached yet stay hidden. */
export function forgeList(save: SaveData): ForgeList {
  const unlocked = highestUnlockedTier(save);
  const tiers = TIERS.filter((tier) => tier <= unlocked).map((tier) => ({
    tier,
    recipeIds: tierRecipes(tier).filter((id) => isKnown(save, recipeById[id])),
  }));
  const plainRecipeIds = recipes
    .filter(
      (recipe) =>
        recipe.station === 'forge' &&
        !forgedItem(recipe) &&
        recipeTier(recipe) <= unlocked &&
        isKnown(save, recipe),
    )
    .map((recipe) => recipe.id);
  return { tiers, plainRecipeIds };
}
