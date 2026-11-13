import type {
  GearEarnedName,
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

import { rarityNames } from './gear';
import { epithetForms } from './gearNames';

import { dungeons, underwaterDungeons } from './dungeons';
import { items } from './items';
import { materials } from './materials';
import { recipes } from './recipes';
import { resources } from './resources';
import { opportunityDefs, restrictionDefs, threatDefs } from './threats';
import { monsterParts } from './loot/monsterParts';
import { relics } from './loot/relics';

export const materialById = Object.fromEntries(materials.map((m) => [m.id, m]));
export const resourceById = Object.fromEntries(resources.map((r) => [r.id, r]));
export const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
export const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));
export const monsterPartById = Object.fromEntries(monsterParts.map((p) => [p.id, p]));
export const relicById = Object.fromEntries(relics.map((r) => [r.id, r]));
export const dungeonById = Object.fromEntries([...dungeons, ...underwaterDungeons].map((d) => [d.id, d]));
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

/** An earned name as it reads: "Bram’s Ogre-bane" ("Fléau-des-ogres de Bram"); null for an epithet no longer in the tables. */
export function earnedNameText(name: GearEarnedName): string | null {
  const forms = epithetForms(name.epithet);
  if (!forms) return null;
  const epithet = tr(forms[Math.min(name.step, forms.length - 1)]);
  return getLocale() === 'fr' ? `${epithet} de ${name.hero}` : `${name.hero}’s ${epithet}`;
}

/**
 * A gear piece's display name: its earned name if it has one, else its name
 * with its rarity, e.g. "Rare stone sword" ("Épée en pierre rare"). Common is left out.
 */
export function gearName(gear: Pick<GearInstance, 'itemId' | 'rarity' | 'relicId' | 'earnedName'>) {
  const earned = gear.earnedName ? earnedNameText(gear.earnedName) : null;
  if (earned) return earned;
  const rarity = gear.rarity === 'common' ? null : tr(rarityNames[gear.rarity]);
  // A restored relic carries the relic's name instead of its item's.
  const base = gear.relicId ? relicById[gear.relicId].name : itemById[gear.itemId].name;
  const parts = getLocale() === 'fr' ? [tr(base), rarity?.toLowerCase()] : [rarity, base];
  return parts.filter(Boolean).join(' ');
}
