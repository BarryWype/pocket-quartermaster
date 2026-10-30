import { componentForgeOdds } from '@/content/forging';
import { gearId, gearRecipes, gearLuckRules } from '@/content/equipment';
import { itemById, relicById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import type { RelicDef } from '@/content/loot/relics';

import { recipeCost } from '../crafting/crafting';
import { masteryOf } from './mastery';
import { rollQuality } from './quality';
import { rollStatFactor } from './roll';
import { createRng } from '../generation/rng';
import { removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { GearDef, RecipeDef } from '../types';

/** The gem a relic of `tier` restores with: rough up to tier 3, cut above. */
function gemFor(tier: number) {
  return (lootConfig.restore.gems.find((gem) => tier <= gem.upToTier) ?? lootConfig.restore.gems.at(-1)!).valuableId;
}

/** The relic's restore recipe: its type's recipe at its tier, each amount ×1.5 rounded up, plus the tier's gem. */
export function relicRecipe(relic: RelicDef): RecipeDef {
  const inputs = gearRecipes[relic.gearType][relic.tier - 1].map(({ materialId, amount }) => ({
    materialId,
    amount: Math.ceil(amount * lootConfig.restore.recipeMultiplier),
  }));
  return {
    id: `restore:${relic.id}`,
    station: 'forge',
    output: { itemId: gearId(relic.gearType, relic.tier) },
    inputs,
    unlockedByDefault: false,
    valuables: [{ valuableId: gemFor(relic.tier), amount: 1 }],
  };
}

/** Whether the relic is held and its restore cost is covered. */
export function canRestore(save: SaveData, relicUid: string) {
  const held = save.relics.find((r) => r.uid === relicUid);
  if (!held) return false;
  return recipeCost(save, relicRecipe(relicById[held.relicId])) !== null;
}

/**
 * Restores a held relic into a finished piece: the recipe's materials plus the
 * tier's gem are spent, and the piece carries the relic with its quality
 * rolled from componentForgeOdds (seeded by its uid, so it can't be
 * rerolled), a Legendary luck roll and a mastery stat roll. No mastery is
 * gained and no blueprint learned. `free` skips the cost (debug).
 */
export function restoreRelic(save: SaveData, relicUid: string, free = false): SaveData {
  const held = save.relics.find((r) => r.uid === relicUid);
  if (!held) throw new Error(`No relic ${relicUid}`);
  const relic = relicById[held.relicId];
  const recipe = relicRecipe(relic);
  const cost = free ? null : recipeCost(save, recipe);
  if (!free && !cost) throw new Error(`Cannot restore ${relic.id}`);

  const uid = `g${save.nextUid}`;
  const mastery = masteryOf(save, relic.gearType);
  const quality = rollQuality(componentForgeOdds, createRng(`${uid}|${relic.id}`));
  // A Legendary restore also rolls +1 Luck, seeded by the piece's uid.
  const luck = quality === 'legendary' && createRng(`${uid}|luck`).chance(gearLuckRules.chance) ? 1 : undefined;
  const gearItem = itemById[gearId(relic.gearType, relic.tier)] as GearDef;
  return {
    ...save,
    relics: save.relics.filter((r) => r.uid !== relicUid),
    ...(cost ? { materials: removeMaterials(save.materials, cost.materials), valuables: cost.valuables } : {}),
    gear: [
      ...save.gear,
      { uid, itemId: gearItem.id, quality, roll: rollStatFactor(uid, mastery.level, relic.tier), ...(luck ? { luck } : {}), relicId: relic.id },
    ],
    nextUid: save.nextUid + 1,
  };
}
