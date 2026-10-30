import { useMemo } from 'react';

import { dockRules } from '@/content/placeActivities';
import { placeRules } from '@/content/places';
import { walkableRules } from '@/content/walkable';
import type { LatLng } from '@/game/generation/types';
import { mapTileAt, mapTileKey, nearWater } from '@/game/generation/walkable';
import type { PlaceSpawn } from '@/game/places/generate';
import type { SaveData } from '@/game/save';
import { secretPlaces, tipSpots } from '@/game/secrets/tips';

import { usePlacedPoints } from './usePlacedSpawns';
import { useWalkableTiles } from './useWalkableTiles';

const placement = { ...walkableRules, ...placeRules.placement };
const tileKey = (point: LatLng) => mapTileKey(mapTileAt(point, placement.mapZoom));

/**
 * This player's tipped secret places, placed on walkable spots. The underwater
 * dungeon waits for the map tiles of its spots, like fishing docks, so its
 * marker never jumps once shown.
 */
export function useSecretPlaces(save: SaveData, now: number): PlaceSpawn[] {
  const minute = Math.floor(now / 60_000);
  const keys = useMemo(
    () =>
      [...new Set(save.secretTips.filter((tip) => tip.secret === 'underwaterDungeon').flatMap(tipSpots).map(tileKey))]
        .sort()
        .join(','),
    [save.secretTips],
  );
  const tiles = useWalkableTiles(keys);
  const candidates = useMemo(() => {
    const ready = keys.split(',').filter(Boolean).every((key) => key in tiles);
    const isNearWater = (point: LatLng) => {
      const tile = tiles[tileKey(point)];
      return tile ? nearWater(tile, point, dockRules.waterMeters) : false;
    };
    return secretPlaces(save, minute * 60_000, ready ? isNearWater : undefined);
  }, [save, minute, tiles, keys]);
  return usePlacedPoints(candidates, placement);
}
