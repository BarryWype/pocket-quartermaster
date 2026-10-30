import type { MasteryState, MasteryType } from '@/game/types';

import type { Element } from '../elements';
import type { Rng } from '../generation/rng';
import type { ChanceInput } from './chances';
import { categoryChance } from './chances';
import { generators } from './generators';
import { emptyLoot, LOOT_CATEGORIES, type Loot, type LootCategory } from './types';

export type LootContext = {
  playerTier: number;
  pickaxeTier: number;
  knownRecipes: string[];
  favourCounts: Partial<Record<MasteryType, number>>;
  mastery: Partial<Record<MasteryType, MasteryState>>;
};

export type LootRequest = ChanceInput & {
  tier: number;
  enemies: string[];
  base: { gold: number; xp: number };
  context: LootContext;
  rng: Rng;
  element?: Element;
  force?: LootCategory;
};

/**
 * Rolls every category of a source in a fixed order, one rng.next() each, so
 * later categories keep their rolls when an early generator changes.
 */
export function rollSourceLoot(req: LootRequest): Loot {
  const loot = emptyLoot();
  for (const category of LOOT_CATEGORIES) {
    const roll = req.rng.next();
    if (req.force !== category && roll >= categoryChance(category, req)) continue;
    loot.dropped.push(category);
    generators[category](req, loot);
  }
  return loot;
}

/** Sums gold and xp, concatenates, merges material stacks by id, unions `dropped`. */
export function mergeLoot(a: Loot, b: Loot): Loot {
  const materials = [...a.materials];
  for (const stack of b.materials) {
    const held = materials.find((s) => s.materialId === stack.materialId);
    if (held) held.amount += stack.amount;
    else materials.push({ ...stack });
  }
  return {
    gold: a.gold + b.gold,
    xp: a.xp + b.xp,
    materials,
    consumables: [...a.consumables, ...b.consumables],
    lures: a.lures + b.lures,
    gear: [...a.gear, ...b.gear],
    recipeIds: [...a.recipeIds, ...b.recipeIds],
    mastery: [...a.mastery, ...b.mastery],
    keyFragments: a.keyFragments + b.keyFragments,
    treasureMaps: [...a.treasureMaps, ...b.treasureMaps],
    manuals: [...a.manuals, ...b.manuals],
    valuables: [...a.valuables, ...b.valuables],
    relics: [...a.relics, ...b.relics],
    dropped: [...a.dropped, ...b.dropped.filter((category) => !a.dropped.includes(category))],
  };
}
