// What the player has found before, for the loot grid's "New" ribbon: a gear
// type, a trinket or a relic. Blueprints and monster parts have their own
// records (knownRecipes, seenParts).

import { itemById, relicById } from '@/content/lookup';

import type { SaveData } from '../save';
import type { GearDef } from '../types';
import type { Loot } from './types';

/** A gear piece's find key: its gear type, or a trinket's own item. */
export function gearFindKey(itemId: string): string | null {
  const item = itemById[itemId] as GearDef | undefined;
  if (!item) return null;
  if (item.slot === 'trinket') return `item:${itemId}`;
  return item.gearType ? `gear:${item.gearType}` : null;
}

export const relicFindKey = (relicId: string) => `relic:${relicId}`;

/** Every find key the save's gear and relics hold now. */
export function heldFindKeys(save: SaveData): string[] {
  return [
    ...save.gear.flatMap((g) => [gearFindKey(g.itemId), g.relicId ? relicFindKey(g.relicId) : null]),
    ...save.relics.map((r) => (relicById[r.relicId] ? relicFindKey(r.relicId) : null)),
  ].filter((key): key is string => key !== null);
}

/** The save with the loot's finds noted as seen. */
export function noteFinds(save: SaveData, loot: Loot): SaveData {
  const keys = [...loot.gear.map((g) => gearFindKey(g.itemId)), ...loot.relics.map(relicFindKey)].filter((key): key is string => key !== null);
  const fresh = [...new Set(keys)].filter((key) => !save.seenFinds.includes(key));
  return fresh.length === 0 ? save : { ...save, seenFinds: [...save.seenFinds, ...fresh] };
}

/** What a save has found before: the "New" ribbon is on anything outside these. */
export type KnownFinds = { recipes: Set<string>; parts: Set<string>; finds: Set<string> };

export function knownFinds(save: SaveData): KnownFinds {
  return {
    recipes: new Set(save.knownRecipes),
    parts: new Set(save.seenParts),
    finds: new Set([...save.seenFinds, ...heldFindKeys(save)]),
  };
}
