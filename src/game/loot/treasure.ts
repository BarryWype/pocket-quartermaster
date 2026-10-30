import { lootConfig } from '@/content/loot/config';

import type { MapRarity } from './types';

/** The treasure spot's distance range for a map's rarity. */
export function mapDistanceRange(rarity: MapRarity): [number, number] {
  return lootConfig.treasureMaps.distanceMeters[rarity];
}
