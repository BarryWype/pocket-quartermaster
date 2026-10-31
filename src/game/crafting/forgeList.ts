import { recipeById } from '@/content/lookup';
import { recipes } from '@/content/recipes';

import type { SaveData } from '../save';
import { forgedItem, isKnown } from './crafting';
import { tierRecipes } from './recipeUnlocks';

const TIERS = [1, 2, 3, 4, 5];

/** The forge's gear blueprints the player knows at one tier. */
export type ForgeTierList = { tier: number; recipeIds: string[] };

/** The forge's craft list: known gear blueprints by tier, and the recipes that need no blueprint. */
export type ForgeList = { tiers: ForgeTierList[]; plainRecipeIds: string[] };

/** What the forge can show: per tier the gear recipes whose blueprint is known, and the non-gear recipes (tools, smelting) known by default. */
export function forgeList(save: SaveData): ForgeList {
  const tiers = TIERS.map((tier) => ({
    tier,
    recipeIds: tierRecipes(tier).filter((id) => isKnown(save, recipeById[id])),
  }));
  const plainRecipeIds = recipes
    .filter((recipe) => recipe.station === 'forge' && !forgedItem(recipe) && isKnown(save, recipe))
    .map((recipe) => recipe.id);
  return { tiers, plainRecipeIds };
}
