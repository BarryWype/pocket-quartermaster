import { gearRules } from '@/content/gear';
import { itemById } from '@/content/lookup';
import { tierMaterials } from '@/content/materials';

import { affixPool, rollAffixes } from '../gear/affixes';
import { createRng } from '../generation/rng';
import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, MaterialStack } from '../types';
import { isAway } from '../team/team';
import { wornBy } from './salvage';

/**
 * What one reroll of a piece costs: its tier material and gold, each grown by
 * `growth` for every reroll the piece has had (trinkets use their tier too).
 */
export function rerollCost(piece: GearInstance): { materials: MaterialStack[]; gold: number } {
  const tier = (itemById[piece.itemId] as GearDef).tier;
  const { material, goldPerTier, growth } = gearRules.reroll;
  const by = growth ** piece.rerolls;
  return {
    materials: [{ materialId: tierMaterials[tier - 1], amount: Math.ceil(material * by) }],
    gold: Math.round(goldPerTier * tier * by),
  };
}

/** A held Uncommon-or-better piece, not away on an expedition, whose reroll cost is met. */
export function canReroll(save: SaveData, gearUid: string) {
  const gear = save.gear.find((g) => g.uid === gearUid);
  if (!gear || gear.rarity === 'common') return false;
  const holder = wornBy(save, gearUid);
  if (holder && isAway(save, holder.id)) return false;
  const { materials, gold } = rerollCost(gear);
  return hasMaterials(save.materials, materials) && save.gold >= gold;
}

/**
 * Rerolls all of a piece's affixes, from its slot's pool with new values, one
 * deterministic roll per reroll: its stats, roll, unique and relic are kept,
 * and the reroll count grows onto the next cost.
 */
export function reroll(save: SaveData, gearUid: string): SaveData {
  if (!canReroll(save, gearUid)) throw new Error(`Cannot reroll ${gearUid}`);
  const gear = save.gear.find((g) => g.uid === gearUid)!;
  const { materials, gold } = rerollCost(gear);
  const affixes = rollAffixes(
    createRng(`${gearUid}|reroll|${gear.rerolls}`),
    { ...gear, affixes: [] },
    gearRules.affixCount[gear.rarity],
    affixPool(gear),
  );
  return {
    ...save,
    gold: save.gold - gold,
    materials: removeMaterials(save.materials, materials),
    gear: save.gear.map((g) => (g.uid === gearUid ? { ...g, affixes, rerolls: g.rerolls + 1 } : g)),
  };
}
