import { affixes } from '@/content/affixes';
import { GEAR_SLOTS } from '@/content/equipment';
import { components } from '@/content/loot/components';
import { monsterParts } from '@/content/loot/monsterParts';

import { forgeGearPiece, forgedItem, isKnown, recipeCost, unlockRecipe } from '../crafting/crafting';
import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearType, RecipeDef } from '../types';

/** The forge's ingredients: monster parts first, then components, both in catalogue order. */
export const ingredients = [...monsterParts, ...components];

/**
 * The affix an ingredient adds to a piece of this gear type: a monster part
 * gives its weapon affix on weapons and its armour one on armour and off-hands,
 * a component its affix on the types its slot lists.
 */
export function ingredientAffixId(ingredientId: string, gearType: GearType): string | undefined {
  const slot = GEAR_SLOTS[gearType] === 'weapon' ? 'weapon' : 'armourOffhand';
  return affixes.find(
    (affix) =>
      ((affix.source.kind === 'part' && affix.source.partId === ingredientId) ||
        (affix.source.kind === 'component' && affix.source.componentId === ingredientId)) &&
      (affix.slot === slot || (typeof affix.slot === 'object' && affix.slot.types.includes(gearType))),
  )?.id;
}

/** Ids of the held parts and components that give this recipe's piece an affix, parts first, in catalogue order. */
export function fittingIngredients(save: SaveData, recipe: RecipeDef): string[] {
  const item = forgedItem(recipe);
  const gearType = item?.gearType;
  if (!gearType) return [];
  return ingredients
    .filter((ingredient) => (save.materials[ingredient.id] ?? 0) > 0 && ingredientAffixId(ingredient.id, gearType))
    .map((ingredient) => ingredient.id);
}

/** Whether the blueprint is known, the ingredient gives the piece an affix, and the materials cover the recipe plus one of it. */
export function canForgeWithIngredient(save: SaveData, recipe: RecipeDef, ingredientId: string) {
  const item = forgedItem(recipe);
  const gearType = item?.gearType;
  if (!gearType || !isKnown(save, recipe) || !ingredientAffixId(ingredientId, gearType)) return false;
  return (
    recipeCost(save, recipe) !== null && hasMaterials(save.materials, [{ materialId: ingredientId, amount: 1 }])
  );
}

/**
 * Forges the recipe's gear with one ingredient added: the full recipe plus that
 * ingredient are spent, and the piece comes out Uncommon with the ingredient's
 * affix (rolled with the piece's other rolls).
 */
export function forgeWithIngredient(save: SaveData, recipe: RecipeDef, ingredientId: string): SaveData {
  if (!canForgeWithIngredient(save, recipe, ingredientId)) throw new Error(`Cannot forge ${recipe.id} with ${ingredientId}`);
  const cost = recipeCost(save, recipe)!;
  const gearItem = forgedItem(recipe)!;
  const affixId = ingredientAffixId(ingredientId, gearItem.gearType!);
  if (!affixId) throw new Error(`Ingredient ${ingredientId} has no affix for ${gearItem.gearType}`);
  const next: SaveData = {
    ...save,
    materials: removeMaterials(save.materials, [...cost.materials, { materialId: ingredientId, amount: 1 }]),
    valuables: cost.valuables,
  };
  return (recipe.unlocks ?? []).reduce(
    unlockRecipe,
    forgeGearPiece(next, gearItem, 'uncommon', { forced: [{ id: affixId }] }),
  );
}
