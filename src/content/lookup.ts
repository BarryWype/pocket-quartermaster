import type { GearInstance, RecipeDef } from '@/game/types';

import { elementInfo } from './elements';
import { qualities } from './forging';

import { dungeons } from './dungeons';
import { items } from './items';
import { materials } from './materials';
import { recipes } from './recipes';
import { resources } from './resources';

export const materialById = Object.fromEntries(materials.map((m) => [m.id, m]));
export const resourceById = Object.fromEntries(resources.map((r) => [r.id, r]));
export const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
export const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));
export const dungeonById = Object.fromEntries(dungeons.map((d) => [d.id, d]));

/** What a recipe makes: an item, or a material for smelting recipes. */
export const recipeOutput = (recipe: RecipeDef) =>
  'itemId' in recipe.output ? itemById[recipe.output.itemId] : materialById[recipe.output.materialId];

/** A gear piece's display name with its quality and element, e.g. "Rare Fire Stone sword". Normal is left out. */
export function gearName(gear: GearInstance) {
  return [
    gear.quality === 'normal' ? null : qualities[gear.quality].name,
    gear.element ? elementInfo[gear.element].name : null,
    itemById[gear.itemId].name,
  ]
    .filter(Boolean)
    .join(' ');
}
