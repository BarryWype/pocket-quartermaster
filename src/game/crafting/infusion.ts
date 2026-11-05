import { affixById } from '@/content/affixes';
import { itemById } from '@/content/lookup';

import { wornBy } from '../forging/salvage';
import { affixValue } from '../gear/affixes';
import { createRng } from '../generation/rng';
import { stoneId, type Element } from '../elements';
import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, GearInstance } from '../types';
import { isAway } from '../team/team';

/** The affix a stone of `element` adds to the piece: Infused on weapons, Warding elsewhere. */
function stoneAffix(piece: GearInstance, element: Element): { id: string; value: number } {
  const item = itemById[piece.itemId] as GearDef;
  const id = `${item.slot === 'weapon' ? 'infused' : 'warding'}${element[0].toUpperCase()}${element.slice(1)}`;
  return { id, value: affixValue(createRng(`${piece.uid}|stone|${id}`), affixById[id]) };
}

/** A held weapon/armour/off-hand piece, not away on an expedition, with that element's stone in stock. */
export function canInfuse(save: SaveData, gearUid: string, element: Element) {
  const gear = save.gear.find((g) => g.uid === gearUid);
  const item = gear ? (itemById[gear.itemId] as GearDef) : undefined;
  const held = !!item && (item.slot === 'weapon' || item.slot === 'armor' || item.slot === 'offhand');
  const holder = wornBy(save, gearUid);
  return (
    held &&
    !(holder && isAway(save, holder.id)) &&
    hasMaterials(save.materials, [{ materialId: stoneId(element), amount: 1 }])
  );
}

/**
 * Uses one stone on a finished piece: a Common piece gains the stone's affix
 * and becomes Uncommon; otherwise one of its affixes is replaced with it,
 * picked from a seed of the piece.
 */
export function infuse(save: SaveData, gearUid: string, element: Element): SaveData {
  if (!canInfuse(save, gearUid, element)) throw new Error(`Cannot infuse ${gearUid} with ${element}`);
  const gear = save.gear.find((g) => g.uid === gearUid)!;
  const affix = stoneAffix(gear, element);
  const affixes = [...gear.affixes];
  if (affixes.length === 0) affixes.push(affix);
  else affixes[createRng(`${gearUid}|stone|${gear.affixes.length}|${gear.rerolls}`).int(0, gear.affixes.length - 1)] = affix;
  return {
    ...save,
    materials: removeMaterials(save.materials, [{ materialId: stoneId(element), amount: 1 }]),
    gear: save.gear.map((g) =>
      g.uid === gearUid ? { ...g, affixes, ...(gear.rarity === 'common' ? { rarity: 'uncommon' as const } : {}) } : g,
    ),
  };
}
