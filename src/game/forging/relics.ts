import { gearId, gearRecipes } from '@/content/equipment';
import { itemById, relicById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import type { RelicDef } from '@/content/loot/relics';

import { makeGearPiece } from '../gear/make';
import { recipeCost } from '../crafting/crafting';
import { guildBonus } from '../guild/guild';
import { removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, RecipeDef } from '../types';

/** The gold a relic of `tier` restores for: the old rough/cut gem's full price. */
function goldFor(tier: number) {
  const step = lootConfig.restore.gold.find((entry) => tier <= entry.upToTier) ?? lootConfig.restore.gold.at(-1)!;
  return Math.round(step.base * lootConfig.goldByTier[tier - 1]);
}

/** The relic's restore recipe: its type's recipe at its tier, each amount ×1.5 rounded up, plus gold. `discount` cuts the cost (Guild Hall). */
export function relicRecipe(relic: RelicDef, discount = 0): RecipeDef & { gold: number } {
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
    gold: Math.max(1, Math.ceil(goldFor(relic.tier) * (1 - discount))),
  };
}

/** Whether the relic is held and its restore cost is covered. */
export function canRestore(save: SaveData, relicUid: string) {
  const held = save.relics.find((r) => r.uid === relicUid);
  if (!held) return false;
  return recipeCost(save, relicRecipe(relicById[held.relicId], guildBonus(save, 'relicRestore'))) !== null;
}

/**
 * Restores a held relic into a finished piece: the recipe's materials and gold
 * are spent, and the piece comes out Legendary: the relic's effect
 * as its unique and 3 affixes, seeded by its uid so they can't be rerolled by
 * reopening. No blueprint learned. `free` skips the cost (debug).
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
  const piece = { ...makeGearPiece(uid, gearItem.id, 'legendary', undefined, { relicId: relic.id }), forged: true };
  return {
    ...save,
    relics: save.relics.filter((r) => r.uid !== relicUid),
    ...(cost ? { materials: removeMaterials(save.materials, cost.materials), gold: save.gold - cost.gold } : {}),
    gear: [...save.gear, piece],
    nextUid: save.nextUid + 1,
  };
}
