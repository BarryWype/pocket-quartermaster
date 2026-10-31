import { itemById, recipeById, relicById } from '@/content/lookup';
import { tierMaterials } from '@/content/materials';
import { recipes } from '@/content/recipes';

import type { SaveData } from '../save';
import type { RecipeDef } from '../types';
import { highestUnlockedTier } from '../dungeons/unlock';
import { canCraft, forgedItem, isKnown } from './crafting';
import { tierRecipes } from './recipeUnlocks';
import { canRestore } from '../forging/relics';

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

/** One page of the forge: one item type, or everything that is not forged gear. */
export type ForgePageType = 'weapons' | 'offhands' | 'armour' | 'other';

/** A forge page: the blueprints the player knows of its type by tier, newest first, and how many are craftable right now. */
export type ForgePage = { type: ForgePageType; craftable: number; tiers: ForgeTierList[] };

/** The forge's craft list: known gear blueprints by tier, the recipes that need no blueprint, and the pages the screen swipes through. */
export type ForgeList = { tiers: ForgeTierList[]; plainRecipeIds: string[]; pages: ForgePage[] };

/** Which page a forged piece belongs to. */
export function pageTypeOf(recipe: RecipeDef): ForgePageType | null {
  const item = forgedItem(recipe);
  if (!item) return null;
  if (item.slot === 'weapon') return 'weapons';
  if (item.slot === 'offhand') return 'offhands';
  return 'armour';
}

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

  // The pages, in the order the screen swipes through them. A page with nothing known stays hidden.
  const gearTiers = (type: ForgePageType): ForgeTierList[] =>
    tiers
      .map(({ tier, recipeIds }) => ({ tier, recipeIds: recipeIds.filter((id) => pageTypeOf(recipeById[id]) === type) }))
      .filter(({ recipeIds }) => recipeIds.length > 0)
      .sort((a, b) => b.tier - a.tier);
  const heldRelicUids = save.relics
    .filter(({ relicId }) => relicById[relicId].tier <= unlocked)
    .map(({ uid }) => uid);
  const gearPages: ForgePage[] = (['weapons', 'offhands', 'armour'] as const)
    .map((type) => {
      const page = gearTiers(type);
      return {
        type,
        tiers: page,
        craftable: page.reduce((sum, { recipeIds }) => sum + recipeIds.filter((id) => canCraft(save, recipeById[id])).length, 0),
      };
    })
    .filter((page) => page.tiers.length > 0);
  const otherContent = heldRelicUids.length > 0 || plainRecipeIds.length > 0;
  const pages: ForgePage[] = otherContent
    ? [
        ...gearPages,
        {
          type: 'other',
          tiers: [],
          craftable:
            heldRelicUids.filter((uid) => canRestore(save, uid)).length +
            plainRecipeIds.filter((id) => canCraft(save, recipeById[id])).length,
        },
      ]
    : gearPages;
  return { tiers, plainRecipeIds, pages };
}
