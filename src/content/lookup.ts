import type {
  GearInstance,
  OpportunityDef,
  OpportunityId,
  RecipeDef,
  RestrictionDef,
  RestrictionId,
  ThreatDef,
  ThreatId,
} from '@/game/types';
import { getLocale, tr } from '@/i18n';

import { elementInfo } from './elements';
import { qualities } from './forging';
import { frElementQualifiers } from './fr/names';

import { dungeons } from './dungeons';
import { items } from './items';
import { materials } from './materials';
import { recipes } from './recipes';
import { resources } from './resources';
import { opportunityDefs, restrictionDefs, threatDefs } from './threats';
import { components } from './loot/components';
import { monsterParts } from './loot/monsterParts';
import { relics } from './loot/relics';
import { valuables } from './loot/valuables';

export const materialById = Object.fromEntries(materials.map((m) => [m.id, m]));
export const resourceById = Object.fromEntries(resources.map((r) => [r.id, r]));
export const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
export const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));
export const monsterPartById = Object.fromEntries(monsterParts.map((p) => [p.id, p]));
export const componentById = Object.fromEntries(components.map((c) => [c.id, c]));
export const valuableById = Object.fromEntries(valuables.map((v) => [v.id, v]));
export const relicById = Object.fromEntries(relics.map((r) => [r.id, r]));
export const dungeonById = Object.fromEntries(dungeons.map((d) => [d.id, d]));
export const threatById = Object.fromEntries(threatDefs.map((t) => [t.id, t])) as Record<ThreatId, ThreatDef>;
export const restrictionById = Object.fromEntries(restrictionDefs.map((r) => [r.id, r])) as Record<
  RestrictionId,
  RestrictionDef
>;
export const opportunityById = Object.fromEntries(opportunityDefs.map((o) => [o.id, o])) as Record<
  OpportunityId,
  OpportunityDef
>;

/** What a recipe makes: an item, or a material for smelting recipes. */
export const recipeOutput = (recipe: RecipeDef) =>
  'itemId' in recipe.output ? itemById[recipe.output.itemId] : materialById[recipe.output.materialId];

/**
 * A gear piece's display name with its quality and element, e.g. "Rare Fire Stone sword"
 * ("Épée en pierre de feu rare"). Normal is left out.
 */
export function gearName(gear: GearInstance) {
  const quality = gear.quality === 'normal' ? null : tr(qualities[gear.quality].name);
  const parts =
    getLocale() === 'fr'
      ? [tr(itemById[gear.itemId].name), gear.element ? frElementQualifiers[gear.element] : null, quality?.toLowerCase()]
      : [quality, gear.element ? elementInfo[gear.element].name : null, itemById[gear.itemId].name];
  return parts.filter(Boolean).join(' ');
}
