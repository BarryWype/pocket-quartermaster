import { itemById } from '@/content/lookup';

import { addMaterials, hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { RecipeDef } from '../types';

export function isKnown(save: SaveData, recipe: RecipeDef) {
  return save.knownRecipes.includes(recipe.id);
}

/** Tools are crafted once; afterwards their recipe has nothing left to make. */
export function ownsTool(save: SaveData, recipe: RecipeDef) {
  return 'itemId' in recipe.output && save.tools.includes(recipe.output.itemId);
}

export function canCraft(save: SaveData, recipe: RecipeDef) {
  return isKnown(save, recipe) && !ownsTool(save, recipe) && hasMaterials(save.materials, recipe.inputs);
}

export function unlockRecipe(save: SaveData, recipeId: string): SaveData {
  if (save.knownRecipes.includes(recipeId)) return save;
  return { ...save, knownRecipes: [...save.knownRecipes, recipeId] };
}

/**
 * Consumes the inputs and adds the output: a material, a consumable, a tool or
 * a new gear piece. Also teaches the recipes this one unlocks.
 */
export function craft(save: SaveData, recipe: RecipeDef): SaveData {
  if (!canCraft(save, recipe)) throw new Error(`Cannot craft ${recipe.id}`);
  let next: SaveData = { ...save, materials: removeMaterials(save.materials, recipe.inputs) };

  if ('materialId' in recipe.output) {
    next = { ...next, materials: addMaterials(next.materials, [recipe.output]) };
  } else {
    const item = itemById[recipe.output.itemId];
    if (item.slot === 'consumable') {
      next = { ...next, consumables: { ...next.consumables, [item.id]: (next.consumables[item.id] ?? 0) + 1 } };
    } else if (item.slot === 'tool') {
      next = { ...next, tools: [...next.tools, item.id] };
    } else {
      next = {
        ...next,
        gear: [...next.gear, { uid: `g${next.nextUid}`, itemId: item.id, durability: item.maxDurability }],
        nextUid: next.nextUid + 1,
      };
    }
  }
  return (recipe.unlocks ?? []).reduce(unlockRecipe, next);
}
