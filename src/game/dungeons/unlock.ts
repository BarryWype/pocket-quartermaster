import { dungeons as allDungeons } from '@/content/dungeons';

import type { SaveData } from '../save';
import type { DungeonDef } from '../types';

/** Tier 1 is open from the start; tier N opens once a tier N-1 boss has been beaten. */
export function isDungeonUnlocked(save: SaveData, dungeon: DungeonDef, dungeons: DungeonDef[] = allDungeons) {
  if (dungeon.tier <= 1) return true;
  return dungeons.some((d) => d.tier === dungeon.tier - 1 && d.isBoss && save.clearedDungeons.includes(d.id));
}

/** The highest dungeon tier the player can reach. */
export const highestUnlockedTier = (save: SaveData, dungeons: DungeonDef[] = allDungeons) =>
  Math.max(...dungeons.filter((d) => isDungeonUnlocked(save, d, dungeons)).map((d) => d.tier));
