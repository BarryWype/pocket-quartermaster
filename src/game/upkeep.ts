import { gatheringConfig, type GatheringConfig } from '@/content/gatheringConfig';

import { pruneCollected } from './gathering/gathering';
import { lureEndsAt } from './rewards/lures';
import type { SaveData } from './save';

/**
 * Drops what has run out: treasure maps, an ended lure, taken recruits, and
 * used Sanctums and gathered spawns past their refresh. A walk effect stays
 * until the background walk processing has gone past its end, or the buffer
 * window has, so a walk processed later still sees it.
 */
export function pruneExpired(save: SaveData, now: number, config: GatheringConfig = gatheringConfig): SaveData {
  const treasureMaps = save.treasureMaps.filter((m) => m.expiresAt > now);
  const activeLure = save.activeLure && lureEndsAt(save) > now ? save.activeLure : null;
  const usedSanctums = pruneCollected(save.usedSanctums, now);
  const collected = pruneCollected(save.collected, now);
  const takenOffers = pruneCollected(save.takenOffers, now);
  const buffer = now - config.autoGather.bufferHours * 3_600_000;
  const walkEffects = save.walkEffects.filter(
    (effect) => effect.endsAt > now || (save.autoGather.processedUntil < effect.endsAt && effect.endsAt >= buffer),
  );
  const unchanged =
    treasureMaps.length === save.treasureMaps.length &&
    activeLure === save.activeLure &&
    walkEffects.length === save.walkEffects.length &&
    Object.keys(usedSanctums).length === Object.keys(save.usedSanctums).length &&
    Object.keys(collected).length === Object.keys(save.collected).length &&
    Object.keys(takenOffers).length === Object.keys(save.takenOffers).length;
  return unchanged ? save : { ...save, treasureMaps, activeLure, walkEffects, usedSanctums, collected, takenOffers };
}
