import { affixById } from '@/content/affixes';
import { itemById } from '@/content/lookup';

import { wornBy } from '../forging/salvage';
import { affixSlotOf, affixValue } from '../gear/affixes';
import { createRng } from '../generation/rng';
import { stoneId, type Element } from '../elements';
import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, GearType } from '../types';
import { isAway } from '../team/team';

/** The affix a stone of `element` adds to a piece of this gear type: Infused on offensive pieces, Warding on defensive ones. */
export function stoneAffixId(gearType: GearType | undefined, element: Element): string {
  return `${affixSlotOf(gearType) === 'weapon' ? 'infused' : 'warding'}${element[0].toUpperCase()}${element.slice(1)}`;
}

/** The affix a stone of `element` adds to the piece: Infused on offensive pieces, Warding on defensive ones. */
function stoneAffix(piece: GearInstance, element: Element): { id: string; value: number } {
  const item = itemById[piece.itemId] as GearDef;
  const id = stoneAffixId(item.gearType, element);
  return { id, value: affixValue(createRng(`${piece.uid}|stone|${id}`), affixById[id]) };
}

/** The affix a stone replaces on a piece that has some, seeded so the preview's promise holds on the apply. */
function replacedIndex(piece: GearInstance): number {
  return createRng(`${piece.uid}|stone|${piece.affixes.length}|${piece.rerolls}`).int(0, piece.affixes.length - 1);
}

/** What applying a stone would do: add to a Common piece, otherwise replace one of its affixes. Null for pieces that take no stones. */
export type StonePreview = { kind: 'add' } | { kind: 'replace'; candidates: string[] };

/** What applying a stone of `element` to a held piece would do; null when the piece is not a weapon, armour or off-hand, or is a work tool. */
export function stonePreview(save: SaveData, gearUid: string, element: Element): StonePreview | null {
  const gear = save.gear.find((g) => g.uid === gearUid);
  const item = gear ? (itemById[gear.itemId] as GearDef) : undefined;
  const held = !!item && !item.workTool && (item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'offhand');
  if (!gear || !held) return null;
  return gear.affixes.length === 0
    ? { kind: 'add' }
    : { kind: 'replace', candidates: gear.affixes.map((affix) => affix.id) };
}

/** A held weapon/armour/off-hand piece that takes stones (work tools do not), not away on an expedition, with that element's stone in stock. */
export function canApplyStone(save: SaveData, gearUid: string, element: Element) {
  const gear = save.gear.find((g) => g.uid === gearUid);
  const item = gear ? (itemById[gear.itemId] as GearDef) : undefined;
  const held = !!item && !item.workTool && (item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'offhand');
  const holder = wornBy(save, gearUid);
  return (
    held &&
    !(holder && isAway(save, holder.id)) &&
    hasMaterials(save.materials, [{ materialId: stoneId(element), amount: 1 }])
  );
}

/**
 * Uses one stone on a finished piece: a Common piece gains the stone's affix
 * and becomes Uncommon; otherwise the affix `stonePreview` showed as up for
 * replacement is swapped for it.
 */
export function applyStone(save: SaveData, gearUid: string, element: Element): SaveData {
  if (!canApplyStone(save, gearUid, element)) throw new Error(`Cannot apply a stone to ${gearUid}`);
  const gear = save.gear.find((g) => g.uid === gearUid)!;
  const affix = stoneAffix(gear, element);
  const affixes = [...gear.affixes];
  if (affixes.length === 0) affixes.push(affix);
  else affixes[replacedIndex(gear)] = affix;
  return {
    ...save,
    materials: removeMaterials(save.materials, [{ materialId: stoneId(element), amount: 1 }]),
    gear: save.gear.map((g) =>
      g.uid === gearUid ? { ...g, affixes, ...(gear.rarity === 'common' ? { rarity: 'uncommon' as const } : {}) } : g,
    ),
  };
}
