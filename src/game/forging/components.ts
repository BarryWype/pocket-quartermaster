import { affixes } from '@/content/affixes';
import { components } from '@/content/loot/components';
import { componentById } from '@/content/lookup';

import { forgeGearPiece, forgedItem, isKnown, recipeCost, unlockRecipe } from '../crafting/crafting';
import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearType, RecipeDef } from '../types';

/** The affix a component gives the piece it is forged into. */
export function componentAffixId(componentId: string): string | undefined {
  return affixes.find((affix) => affix.source.kind === 'component' && affix.source.componentId === componentId)?.id;
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

/** Whether the blueprint is known, the component fits, and the materials cover the recipe plus the component. */
export function canForgeWithComponent(save: SaveData, recipe: RecipeDef, componentId: string) {
  const item = forgedItem(recipe);
  if (!item?.gearType || !isKnown(save, recipe) || !componentFits(componentId, item.gearType)) return false;
  return (
    recipeCost(save, recipe) !== null && hasMaterials(save.materials, [{ materialId: componentId, amount: 1 }])
  );
}

/**
 * Forges the recipe's gear with one component added: the full recipe plus that
 * component are spent, and the piece comes out Uncommon with the component's
 * affix (rolled with the piece's other rolls).
 */
export function forgeWithComponent(save: SaveData, recipe: RecipeDef, componentId: string): SaveData {
  if (!canForgeWithComponent(save, recipe, componentId)) throw new Error(`Cannot forge ${recipe.id} with ${componentId}`);
  const cost = recipeCost(save, recipe)!;
  const gearItem = forgedItem(recipe)!;
  const affixId = componentAffixId(componentId);
  if (!affixId) throw new Error(`Component ${componentId} has no affix`);
  const next: SaveData = {
    ...save,
    materials: removeMaterials(save.materials, [...cost.materials, { materialId: componentId, amount: 1 }]),
    valuables: cost.valuables,
  };
  return (recipe.unlocks ?? []).reduce(
    unlockRecipe,
    forgeGearPiece(next, gearItem, 'uncommon', { forced: [{ id: affixId }] }),
  );
}
