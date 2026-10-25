import { itemById } from '@/content/lookup';

import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { RecipeDef } from '../types';

export function isKnown(save: SaveData, recipe: RecipeDef) {
  return save.knownRecipes.includes(recipe.id);
}

/** Tools are crafted once and kept. */
export function isOwnedTool(save: SaveData, recipe: RecipeDef) {
  return save.tools.includes(recipe.itemId);
}

export function canCraft(save: SaveData, recipe: RecipeDef) {
  return isKnown(save, recipe) && !isOwnedTool(save, recipe) && hasMaterials(save.materials, recipe.inputs);
}

/** Consumes the inputs and adds the crafted item: a tool, a new gear piece or one consumable. */
export function craft(save: SaveData, recipe: RecipeDef): SaveData {
  if (!canCraft(save, recipe)) throw new Error(`Cannot craft ${recipe.id}`);
  const item = itemById[recipe.itemId];
  const materials = removeMaterials(save.materials, recipe.inputs);

  if (item.slot === 'tool') return { ...save, materials, tools: [...save.tools, item.id] };
  if (item.slot === 'consumable') {
    return {
      ...save,
      materials,
      consumables: { ...save.consumables, [item.id]: (save.consumables[item.id] ?? 0) + 1 },
    };
  }
  return {
    ...save,
    materials,
    gear: [...save.gear, { uid: `g${save.nextUid}`, itemId: item.id, durability: item.maxDurability }],
    nextUid: save.nextUid + 1,
  };
}

export function unlockRecipe(save: SaveData, recipeId: string): SaveData {
  if (save.knownRecipes.includes(recipeId)) return save;
  return { ...save, knownRecipes: [...save.knownRecipes, recipeId] };
}
