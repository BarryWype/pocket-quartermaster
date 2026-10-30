// The purpose tags of doc/design/loot/purposes.csv: what a base item is for,
// shown as an icon on its inventory tile and usable as a filter. Which items
// carry which tag is computed in game/loot/purposes.ts.

export const PURPOSES = ['ingredient', 'good', 'quest', 'collect', 'restore', 'use'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const purposeInfo: Record<Purpose, { name: string; icon: string }> = {
  ingredient: { name: 'Ingredient', icon: '⚗️' },
  good: { name: 'Good', icon: '🪙' },
  quest: { name: 'Quest', icon: '⭐' },
  collect: { name: 'Collect', icon: '🧩' },
  restore: { name: 'Restore', icon: '🔨' },
  use: { name: 'Use', icon: '✋' },
};
