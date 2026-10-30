import { lootConfig } from '@/content/loot/config';
import { xpToNextLevel } from '@/content/heroes';

import { highestUnlockedTier } from '../dungeons/unlock';
import type { SaveData } from '../save';
import { addXp } from '../team/team';
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

/** Reads a held manual to a hero: its capped XP, the manual used up. */
export function readManual(save: SaveData, heroId: string, rarity: ManualRarity): SaveData {
  if ((save.manuals[rarity] ?? 0) < 1) throw new Error(`No ${rarity} manual`);
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) throw new Error(`No hero ${heroId}`);
  const xp = manualXp(hero, rarity, highestUnlockedTier(save));
  return {
    ...save,
    manuals: { ...save.manuals, [rarity]: (save.manuals[rarity] ?? 0) - 1 },
    heroes: save.heroes.map((h) => (h.id === heroId ? addXp(h, xp) : h)),
  };
}
