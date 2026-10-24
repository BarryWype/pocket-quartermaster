import { gatheringConfig, type GatheringConfig } from '@/content/gatheringConfig';

import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';

export type GpsFix = {
  position: LatLng;
  /** Metres, null when unknown. */
  accuracy: number | null;
  /** Metres per second, null when unknown. */
  speed: number | null;
  timestamp: number;
};

/**
 * Returns the fix to use (with speed filled in when the GPS didn't report it),
 * or null when the reading is too inaccurate or implies an impossible jump.
 */
export function acceptFix(
  previous: GpsFix | null,
  next: GpsFix,
  config: GatheringConfig = gatheringConfig,
): GpsFix | null {
  if (next.accuracy !== null && next.accuracy > config.maxAccuracyMeters) return null;
  if (!previous) return next;

  const seconds = (next.timestamp - previous.timestamp) / 1000;
  if (seconds <= 0) return null;
  const impliedSpeed = distanceMeters(previous.position, next.position) / seconds;
  if (impliedSpeed > config.maxPlausibleSpeed) return null;

  return { ...next, speed: next.speed ?? impliedSpeed };
}
