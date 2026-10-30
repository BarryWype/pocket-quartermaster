import { componentForgeOdds } from '@/content/forging';
import { components } from '@/content/loot/components';
import { componentById } from '@/content/lookup';
import { tierMaterials } from '@/content/materials';

import { forgedItem, forgeGearPiece, isKnown, recipeCost, unlockRecipe } from '../crafting/crafting';
import { removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearType, MaterialStack, Quality, RecipeDef } from '../types';

/**
 * The recipe's inputs with one unit of a secondary material swapped for the
 * component. The main material stays in full: the tier's metal or stone from
 * tier 2 on, the largest input at tier 1 (ties to the last listed). A
 * one-material recipe loses that unit of the main material instead.
 */
export function componentRecipe(recipe: RecipeDef, componentId: string): MaterialStack[] {
  const item = forgedItem(recipe);
  if (!item) throw new Error(`${recipe.id} forges no gear`);
  const tierMaterial = tierMaterials[item.tier - 1];
  const mainId =
    item.tier >= 2 && recipe.inputs.some((input) => input.materialId === tierMaterial)
      ? tierMaterial
      : recipe.inputs.reduce((best, input) => (input.amount >= best.amount ? input : best)).materialId;
  const inputs = recipe.inputs.map(({ materialId, amount }) => ({ materialId, amount }));
  const swapped = inputs.find((input) => input.materialId !== mainId) ?? inputs.find((input) => input.materialId === mainId)!;
  swapped.amount -= 1;
  return [...inputs.filter((input) => input.amount > 0), { materialId: componentId, amount: 1 }];
}

/** Whether the component can be forged into a piece of this gear type. */
export function componentFits(componentId: string, gearType: GearType) {
  return componentById[componentId]?.fits.includes(gearType) ?? false;
}

/** Ids of the components the player holds that fit the recipe's gear type, in catalogue order. */
export function fittingComponents(save: SaveData, recipe: RecipeDef): string[] {
  const item = forgedItem(recipe);
  const gearType = item?.gearType;
  if (!gearType) return [];
  return components.filter((c) => c.fits.includes(gearType) && (save.materials[c.id] ?? 0) > 0).map((c) => c.id);
}

/** Whether the blueprint is known, the component fits, and the materials cover the swapped inputs. */
export function canForgeWithComponent(save: SaveData, recipe: RecipeDef, componentId: string) {
  const item = forgedItem(recipe);
  if (!item?.gearType || !isKnown(save, recipe) || !componentFits(componentId, item.gearType)) return false;
  return recipeCost(save, { ...recipe, inputs: componentRecipe(recipe, componentId) }) !== null;
}

/**
 * Forges the recipe's gear with one unit of a secondary material swapped for
 * the component: the piece carries the component, a heart infuses its element
 * for good, and quality comes from componentForgeOdds. Mastery gains as with
 * any forge.
 */
export function forgeWithComponent(save: SaveData, recipe: RecipeDef, componentId: string, forceQuality?: Quality): SaveData {
  if (!canForgeWithComponent(save, recipe, componentId)) throw new Error(`Cannot forge ${recipe.id} with ${componentId}`);
  const cost = recipeCost(save, { ...recipe, inputs: componentRecipe(recipe, componentId) })!;
  const gearItem = forgedItem(recipe)!;
  const component = componentById[componentId];
  const element = component.effect.kind === 'infusion' ? component.element : undefined;
  let next: SaveData = {
    ...save,
    materials: removeMaterials(save.materials, cost.materials),
    valuables: cost.valuables,
  };
  next = forgeGearPiece(
    next,
    recipe,
    gearItem,
    () => componentForgeOdds,
    { component: componentId, ...(element ? { element } : {}) },
    forceQuality,
  );
  return (recipe.unlocks ?? []).reduce(unlockRecipe, next);
}
