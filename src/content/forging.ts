import type { Rarity } from '@/content/gear';

export const salvageRules = {
  /** Share of each recipe input returned, rounded down; the first input always returns at least 1. */
  returned: { common: 0.4, uncommon: 0.5, rare: 0.6, legendary: 1 } satisfies Record<Rarity, number>,
};
