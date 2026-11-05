import { recipeById, relicById } from '@/content/lookup';
import type { Rarity } from '@/content/gear';

import type { SaveData } from '../save';
import type { GearType } from '../types';
import { canRestore, relicRecipe } from '../forging/relics';
import { guildBonus } from '../guild/guild';
import { forgedItem } from './crafting';

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


/** What one forge of `recipeId` asks before it happens: the piece, the rarity it comes out as, the cost and the chosen component's effect. */
export type ForgeConfirmation = {
  kind: 'forge';
  recipeId: string;
  componentId: string | null;
  itemId: string;
  tier: number;
  gearType: GearType;
  /** Uncommon with a component, Common without. */
  expectedRarity: Rarity;
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

/** The confirmation for one forge, plain or with a held component. */
export function forgeConfirmation(save: SaveData, recipeId: string, componentId: string | null = null): ForgeConfirmation | null {
  const recipe = recipeById[recipeId];
  const item = forgedItem(recipe);
  if (!item?.gearType) return null;
  const inputs = componentId ? [...recipe.inputs, { materialId: componentId, amount: 1 }] : recipe.inputs;
  return {
    kind: 'forge',
    recipeId,
    componentId,
    itemId: item.id,
    tier: item.tier,
    gearType: item.gearType,
    expectedRarity: componentId ? 'uncommon' : 'common',
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
