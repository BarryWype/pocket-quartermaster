import { dungeons as allDungeons } from '@/content/dungeons';

import type { SaveData } from '../save';
import type { DungeonDef } from '../types';

/** The tier's chain — its dungeons with a chainIndex, boss included, in chain order. */
export function tierChain(tier: number, dungeons: DungeonDef[] = allDungeons): DungeonDef[] {
  return dungeons
    .filter((d) => d.tier === tier && d.chainIndex !== undefined)
    .sort((a, b) => a.chainIndex! - b.chainIndex!);
}

/**
 * Whether the player has access to the dungeon. Chain dungeons open in chain
 * order: index 0 with the tier (tier 1 from the start, tier N once the tier
 * N-1 boss has fallen), index i once index i-1 is cleared. A dungeon also
 * counts as unlocked when anything later in its tier's chain is already
 * cleared, so no existing save loses access.
 */
export function isDungeonUnlocked(save: SaveData, dungeon: DungeonDef, dungeons: DungeonDef[] = allDungeons) {
  const cleared = new Set(save.clearedDungeons);
  const tierOpen = dungeon.tier <= 1 || dungeons.some((d) => d.tier === dungeon.tier - 1 && d.isBoss && cleared.has(d.id));
  // Overnight expeditions and secret dungeons follow their tier, not the chain.
  if (dungeon.chainIndex === undefined) return tierOpen;
  const chain = tierChain(dungeon.tier, dungeons);
  if (chain.some((d) => d.chainIndex! > dungeon.chainIndex! && cleared.has(d.id))) return true;
  if (chain.some((d) => d.isBoss && cleared.has(d.id))) return true;
  if (dungeon.chainIndex === 0) return tierOpen;
  const previous = chain.find((d) => d.chainIndex === dungeon.chainIndex! - 1);
  return !!previous && cleared.has(previous.id);
}

/** The highest dungeon tier the player can reach. */
export const highestUnlockedTier = (save: SaveData, dungeons: DungeonDef[] = allDungeons) =>
  Math.max(...dungeons.filter((d) => isDungeonUnlocked(save, d, dungeons)).map((d) => d.tier));
