import { recipes } from '@/content/recipes';
import { threatRules, type ThreatRules } from '@/content/threats';

import type { MaterialStack } from '../types';

export type Salvage = {
  /** Half of each recipe input, the main (first) one at least 1. */
  materials: MaterialStack[];
  gold: number;
};

/**
 * What an un-triggered consumable breaks back into: half of its recipe's
 * inputs (the main one at least 1), or a little gold without a recipe.
 */
export function salvage(itemId: string, rules: ThreatRules = threatRules): Salvage {
  const recipe = recipes.find((r) => 'itemId' in r.output && r.output.itemId === itemId);
  if (!recipe) return { materials: [], gold: rules.salvageGold };
  const materials = recipe.inputs
    .map((input, i) => ({ materialId: input.materialId, amount: Math.max(i === 0 ? 1 : 0, Math.floor(input.amount / 2)) }))
    .filter((stack) => stack.amount > 0);
  return { materials, gold: 0 };
}
