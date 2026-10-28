import { wornBy } from '../forging/salvage';
import { hasMaterials, removeMaterials } from '../inventory';
import { stoneId, type Element } from '../elements';
import type { SaveData } from '../save';
import { isAway } from '../team/team';

/** A plain (never infused) piece, not away on an expedition, and a stone of the element in stock. */
export function canInfuse(save: SaveData, gearUid: string, element: Element) {
  const gear = save.gear.find((g) => g.uid === gearUid);
  const holder = wornBy(save, gearUid);
  return (
    !!gear &&
    !gear.element &&
    !(holder && isAway(save, holder.id)) &&
    hasMaterials(save.materials, [{ materialId: stoneId(element), amount: 1 }])
  );
}

/** Uses one stone to give a plain gear piece an element. */
export function infuse(save: SaveData, gearUid: string, element: Element): SaveData {
  if (!canInfuse(save, gearUid, element)) throw new Error(`Cannot infuse ${gearUid} with ${element}`);
  return {
    ...save,
    materials: removeMaterials(save.materials, [{ materialId: stoneId(element), amount: 1 }]),
    gear: save.gear.map((g) => (g.uid === gearUid ? { ...g, element } : g)),
  };
}
