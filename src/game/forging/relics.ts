import { gearId, gearRecipes } from '@/content/equipment';
import type { Rarity } from '@/content/gear';
import { itemById, relicById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import type { RelicDef } from '@/content/loot/relics';

import { makeGearPiece } from '../gear/make';
import { recipeCost } from '../crafting/crafting';
import { guildBonus } from '../guild/guild';
import { createRng } from '../generation/rng';
import { removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, RecipeDef } from '../types';

/** A restored piece's rarity, seeded by the piece's uid. */
function relicRarity(uid: string, relicId: string): Rarity {
  return createRng(`${uid}|${relicId}`).weighted(['rare', 'legendary'] as Rarity[], (r) => (r === 'legendary' ? 20 : 80));
}

/** The gem a relic of `tier` restores with: rough up to tier 3, cut above. */
function gemFor(tier: number) {
  return (lootConfig.restore.gems.find((gem) => tier <= gem.upToTier) ?? lootConfig.restore.gems.at(-1)!).valuableId;
}

/** The relic's restore recipe: its type's recipe at its tier, each amount ×1.5 rounded up, plus the tier's gem. `discount` cuts the cost (Guild Hall). */
export function relicRecipe(relic: RelicDef, discount = 0): RecipeDef {
  const inputs = gearRecipes[relic.gearType][relic.tier - 1].map(({ materialId, amount }) => ({
    materialId,
    amount: Math.max(1, Math.ceil(Math.ceil(amount * lootConfig.restore.recipeMultiplier) * (1 - discount))),
  }));
  return {
    id: `restore:${relic.id}`,
    station: 'forge',
    output: { itemId: gearId(relic.gearType, relic.tier) },
    inputs,
    unlockedByDefault: false,
    valuables: [{ valuableId: gemFor(relic.tier), amount: Math.max(1, Math.ceil(1 * (1 - discount))) }],
  };
}

/** Whether the relic is held and its restore cost is covered. */
export function canRestore(save: SaveData, relicUid: string) {
  const held = save.relics.find((r) => r.uid === relicUid);
  if (!held) return false;
  return recipeCost(save, relicRecipe(relicById[held.relicId], guildBonus(save, 'relicRestore'))) !== null;
}

/**
 * Restores a held relic into a finished piece: the recipe's materials plus the
 * tier's gem are spent, and the piece carries the relic, with its rarity
 * rolled from the old component odds (seeded by its uid, so it can't be
 * rerolled). No blueprint learned. `free` skips the cost (debug).
 */
export function restoreRelic(save: SaveData, relicUid: string, free = false): SaveData {
  const held = save.relics.find((r) => r.uid === relicUid);
  if (!held) throw new Error(`No relic ${relicUid}`);
  const relic = relicById[held.relicId];
  const recipe = relicRecipe(relic, free ? 0 : guildBonus(save, 'relicRestore'));
  const cost = free ? null : recipeCost(save, recipe);
  if (!free && !cost) throw new Error(`Cannot restore ${relic.id}`);

  const uid = `g${save.nextUid}`;
  const gearItem = itemById[gearId(relic.gearType, relic.tier)] as GearDef;
  const piece = makeGearPiece(uid, gearItem.id, relicRarity(uid, relic.id), undefined, { relicId: relic.id });
  return {
    ...save,
    relics: save.relics.filter((r) => r.uid !== relicUid),
    ...(cost ? { materials: removeMaterials(save.materials, cost.materials), valuables: cost.valuables } : {}),
    gear: [...save.gear, piece],
    nextUid: save.nextUid + 1,
  };
}
