import { pruneCollected } from './gathering/gathering';
import { lureEndsAt } from './rewards/lures';
import type { SaveData } from './save';

/** Drops what has run out: treasure maps, an ended lure, taken recruits, and used Sanctums and gathered spawns past their refresh. */
export function pruneExpired(save: SaveData, now: number): SaveData {
  const treasureMaps = save.treasureMaps.filter((m) => m.expiresAt > now);
  const activeLure = save.activeLure && lureEndsAt(save) > now ? save.activeLure : null;
  const usedSanctums = pruneCollected(save.usedSanctums, now);
  const collected = pruneCollected(save.collected, now);
  const takenOffers = pruneCollected(save.takenOffers, now);
  const unchanged =
    treasureMaps.length === save.treasureMaps.length &&
    activeLure === save.activeLure &&
    Object.keys(usedSanctums).length === Object.keys(save.usedSanctums).length &&
    Object.keys(collected).length === Object.keys(save.collected).length &&
    Object.keys(takenOffers).length === Object.keys(save.takenOffers).length;
  return unchanged ? save : { ...save, treasureMaps, activeLure, usedSanctums, collected, takenOffers };
}
