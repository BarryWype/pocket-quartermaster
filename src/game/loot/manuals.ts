import { lootConfig } from '@/content/loot/config';
import { xpToNextLevel } from '@/content/heroes';

import type { ManualRarity } from './types';

/**
 * A manual's XP: `xpPerTier[rarity] × playerTier`, capped so the hero never
 * passes the tier band's top level.
 */
export function manualXp(hero: { level: number; xp: number }, rarity: ManualRarity, playerTier: number): number {
  const top = lootConfig.manuals.topLevelByTier[playerTier - 1];
  let cap = -hero.xp;
  for (let level = hero.level; level < top; level++) cap += xpToNextLevel(level);
  return Math.max(0, Math.min(lootConfig.manuals.xpPerTier[rarity] * playerTier, cap));
}
