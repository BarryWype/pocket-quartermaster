import { itemById } from '@/content/lookup';

import { sparePieces } from '../../families/dress';
import type { SaveData } from '../../save';
import type { GearDef, GearInstance } from '../../types';

// The bot's spare pieces: which it keeps for family swaps (see
// families/dress.ts) and which it salvages.

const defOf = (gear: GearInstance) => itemById[gear.itemId] as GearDef;

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, legendary: 3 } as const;

/**
 * The spare pieces worth keeping for family swaps: the best one of each gear
 * type (tier, then rarity, then dice) of the top tier or the one below. The
 * rest are salvaged.
 */
export function sparesToKeep(save: SaveData, topTier: number): Set<string> {
  const best = new Map<string, GearInstance>();
  const rank = (g: GearInstance) => [defOf(g).tier, RARITY_RANK[g.rarity], g.roll] as const;
  for (const gear of sparePieces(save)) {
    const item = defOf(gear);
    if (!item.gearType || item.tier < topTier - 1) continue;
    const held = best.get(item.gearType);
    const [a, b] = [rank(gear), held ? rank(held) : null];
    if (!b || a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) best.set(item.gearType, gear);
  }
  return new Set([...best.values()].map((g) => g.uid));
}
