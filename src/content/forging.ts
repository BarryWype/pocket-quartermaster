import type { Rarity } from '@/content/gear';

export const salvageRules = {
  /** Share of each recipe input returned, rounded down; the first input always returns at least 1. */
  returned: { common: 0.4, uncommon: 0.5, rare: 0.6, legendary: 1 } satisfies Record<Rarity, number>,
  /** Chance a piece with a keyword affix also gives back 1 of that affix's component; monster parts never come back. */
  componentReturnChance: 0.5,
};
