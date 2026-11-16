import { dockRules } from '@/content/placeActivities';
import { placeRules } from '@/content/places';
import { walkableRules } from '@/content/walkable';

import { mapTileAt, mapTileKey, nearWater, placePoint, type WalkableTile } from '../generation/walkable';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from './generate';

/** Places snap with coarse map tiles so they can be shown from kilometres away. */
export const placePlacement = { ...walkableRules, ...placeRules.placement };

/** Fishing docks only stay where there is water nearby; with no map tile, there's no telling, so they're left out. */
export const keepPlace = (place: PlaceSpawn, tile: WalkableTile | null, position: LatLng) =>
  place.kind !== 'fishingDock' || (tile !== null && nearWater(tile, position, dockRules.waterMeters));

/**
 * Where a place stands on the map: its position snapped onto walkable ground
 * and kept by the rules — null when the rules drop it, the raw position when
 * its map tile is missing from `tiles` (offline, the game still works).
 */
export function placedPosition(place: PlaceSpawn, tiles: Record<string, WalkableTile | null>): LatLng | null {
  const key = mapTileKey(mapTileAt(place.position, placePlacement.mapZoom));
  if (!(key in tiles)) return place.position;
  const placed = placePoint(place.position, tiles, placePlacement);
  if (placed === null || placed === undefined) return null;
  return keepPlace(place, tiles[key], placed) ? placed : null;
}
