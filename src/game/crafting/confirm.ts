import { affixById } from '@/content/affixes';
import { recipeById, relicById } from '@/content/lookup';
import type { Rarity } from '@/content/gear';

import type { SaveData } from '../save';
import type { GearType, StatKey } from '../types';
import { canRestore, relicRecipe } from '../forging/relics';
import { forgedItem } from './crafting';
import { ingredientAffixId } from '../forging/components';
import { guildBonus } from '../guild/guild';
import { statRange } from '../gear/stats';

/** One thing the forge spends: how many are needed, held, and left after. */
export type CostLine = {
  id: string;
  needed: number;
  held: number;
  remaining: number;
};

/** The full cost of one forge or restore: materials and valuables (gems), each with what is held and what remains. */
export type ConfirmCost = { materials: CostLine[]; valuables: CostLine[] };

const materialCost = (save: SaveData, inputs: { materialId: string; amount: number }[]): CostLine[] =>
  inputs.map(({ materialId, amount }) => {
    const held = save.materials[materialId] ?? 0;
    return { id: materialId, needed: amount, held, remaining: Math.max(0, held - amount) };
  });

const valuableCost = (save: SaveData, valuables: { valuableId: string; amount: number }[] = []): CostLine[] =>
  valuables.map(({ valuableId, amount }) => {
    const held = Object.entries(save.valuables).reduce(
      (sum, [key, n]) => (key.startsWith(`${valuableId}:`) ? sum + n : sum),
      0,
    );
    return { id: valuableId, needed: amount, held, remaining: Math.max(0, held - amount) };
  });


/** What one forge of `recipeId` asks before it happens: the piece, the rarity it comes out as, the ingredients' affix, the stat ranges and the cost. */
export type ForgeConfirmation = {
  kind: 'forge';
  recipeId: string;
  ingredientId: string | null;
  itemId: string;
  tier: number;
  gearType: GearType;
  /** Uncommon with an ingredient, Common without. */
  expectedRarity: Rarity;
  /** The chosen ingredient's affix and its rolled-value range; absent with none or a fixed one. */
  affix?: { id: string; min: number; max: number };
  /** Every stat of the piece at the range the forge can roll at the expected rarity. */
  statRanges: { key: StatKey; min: number; max: number }[];
  cost: ConfirmCost;
};

/** What restoring a held relic asks before it happens: the relic, its effect and the cost. */
export type RestoreConfirmation = {
  kind: 'restore';
  relicUid: string;
  relicId: string;
  tier: number;
  gearType: GearType;
  cost: ConfirmCost;
};

/** The confirmation for one forge, plain or with one held ingredient. */
export function forgeConfirmation(save: SaveData, recipeId: string, ingredientId: string | null = null): ForgeConfirmation | null {
  const recipe = recipeById[recipeId];
  const item = forgedItem(recipe);
  if (!item?.gearType) return null;
  const inputs = ingredientId ? [...recipe.inputs, { materialId: ingredientId, amount: 1 }] : recipe.inputs;
  const expectedRarity: Rarity = ingredientId ? 'uncommon' : 'common';
  const ingredientAffix = ingredientId ? affixById[ingredientAffixId(ingredientId, item.gearType) ?? ''] : undefined;
  return {
    kind: 'forge',
    recipeId,
    ingredientId,
    itemId: item.id,
    tier: item.tier,
    gearType: item.gearType,
    expectedRarity,
    ...(ingredientAffix?.range ? { affix: { id: ingredientAffix.id, ...ingredientAffix.range } } : {}),
    statRanges: Object.entries(item.stats).map(([key, base]) => ({
      key: key as StatKey,
      ...statRange(base ?? 0, expectedRarity),
    })),
    cost: { materials: materialCost(save, inputs), valuables: valuableCost(save, recipe.valuables) },
  };
}

/** The confirmation for restoring a held relic. */
export function restoreConfirmation(save: SaveData, relicUid: string): RestoreConfirmation | null {
  const held = save.relics.find((r) => r.uid === relicUid);
  if (!held || !canRestore(save, relicUid)) return null;
  const relic = relicById[held.relicId];
  const recipe = relicRecipe(relic, guildBonus(save, 'relicRestore'));
  return {
    kind: 'restore',
    relicUid,
    relicId: relic.id,
    tier: relic.tier,
    gearType: relic.gearType,
    cost: { materials: materialCost(save, recipe.inputs), valuables: valuableCost(save, recipe.valuables) },
  };
}
