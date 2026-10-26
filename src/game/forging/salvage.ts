import { salvageRules } from '@/content/forging';
import { itemById } from '@/content/lookup';
import { recipes } from '@/content/recipes';

import { convertShards, ELEMENTS, shardId, type Element } from '../elements';
import { createRng } from '../generation/rng';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, MaterialStack } from '../types';

type Rules = typeof salvageRules;

export const wornBy = (save: SaveData, gearUid: string) =>
  save.heroes.find((h) => h.equipment.weapon === gearUid || h.equipment.armor === gearUid);

/** Worn gear (including gear away on an expedition) has to be taken off first. */
export function canSalvage(save: SaveData, gearUid: string) {
  return save.gear.some((g) => g.uid === gearUid) && !wornBy(save, gearUid);
}

/** Rare, Legendary and infused pieces ask before they are destroyed. */
export const salvageNeedsConfirmation = (gear: GearInstance) =>
  gear.quality === 'rare' || gear.quality === 'legendary' || !!gear.element;

/**
 * What salvaging a piece gives back: a share of its recipe by quality (at
 * least 1 of the first input), 5 shards of its element if infused, and for a
 * Legendary piece shards of an element picked from its uid, one per tier.
 */
export function salvageReturns(gear: GearInstance, rules: Rules = salvageRules): MaterialStack[] {
  const item = itemById[gear.itemId] as GearDef;
  const recipe = recipes.find((r) => 'itemId' in r.output && r.output.itemId === gear.itemId);
  const share = rules.returned[gear.quality];
  const returned = (recipe?.inputs ?? []).map(({ materialId, amount }, i) => ({
    materialId,
    amount: Math.max(i === 0 ? 1 : 0, Math.floor(amount * share)),
  }));

  const shards: [Element, number][] = [];
  if (gear.element) shards.push([gear.element, rules.infusedShards]);
  if (gear.quality === 'legendary') {
    const element = ELEMENTS[createRng(`${gear.uid}|salvage`).int(0, ELEMENTS.length - 1)];
    shards.push([element, rules.legendaryShardsPerTier * item.tier]);
  }
  const all = [...returned, ...shards.map(([element, amount]) => ({ materialId: shardId(element), amount }))];
  // Merged, so an infused Legendary piece shows one line per shard element.
  return Object.entries(addMaterials({}, all))
    .filter(([, amount]) => amount > 0)
    .map(([materialId, amount]) => ({ materialId, amount }));
}

/** Destroys a gear piece and gives back `salvageReturns`; shards merge into stones as usual. */
export function salvage(save: SaveData, gearUid: string): SaveData {
  const gear = save.gear.find((g) => g.uid === gearUid);
  if (!gear || !canSalvage(save, gearUid)) throw new Error(`Cannot salvage ${gearUid}`);
  return {
    ...save,
    materials: convertShards(addMaterials(save.materials, salvageReturns(gear))),
    gear: save.gear.filter((g) => g.uid !== gearUid),
  };
}
