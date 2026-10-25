import { addMaterials, hasMaterials, removeMaterials } from '../inventory';
import { convertShards, shardId, stoneId, type Element } from '../elements';
import type { SaveData } from '../save';
import { isOnExpedition } from '../team/team';

function wearer(save: SaveData, gearUid: string) {
  return save.heroes.find((h) => h.equipment.weapon === gearUid || h.equipment.armor === gearUid);
}

/** A plain (never infused) piece, not away on an expedition, and a stone of the element in stock. */
export function canInfuse(save: SaveData, gearUid: string, element: Element) {
  const gear = save.gear.find((g) => g.uid === gearUid);
  const holder = wearer(save, gearUid);
  return (
    !!gear &&
    !gear.element &&
    !(holder && isOnExpedition(save, holder.id)) &&
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

/** Only infused pieces at home can be recycled; they give back one shard of their element. */
export function canRecycle(save: SaveData, gearUid: string) {
  const gear = save.gear.find((g) => g.uid === gearUid);
  const holder = wearer(save, gearUid);
  return !!gear?.element && !(holder && isOnExpedition(save, holder.id));
}

/** Destroys an infused piece (unequipping it) and returns one shard of its element. */
export function recycle(save: SaveData, gearUid: string): SaveData {
  const gear = save.gear.find((g) => g.uid === gearUid);
  if (!gear?.element || !canRecycle(save, gearUid)) throw new Error(`Cannot recycle ${gearUid}`);
  return {
    ...save,
    materials: convertShards(addMaterials(save.materials, [{ materialId: shardId(gear.element), amount: 1 }])),
    gear: save.gear.filter((g) => g.uid !== gearUid),
    heroes: save.heroes.map((h) => ({
      ...h,
      equipment: {
        ...h.equipment,
        weapon: h.equipment.weapon === gearUid ? null : h.equipment.weapon,
        armor: h.equipment.armor === gearUid ? null : h.equipment.armor,
      },
    })),
  };
}
