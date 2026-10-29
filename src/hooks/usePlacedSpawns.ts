import { useMemo } from 'react';

import type { LatLng, Spawn } from '@/game/generation/types';
import {
  mapTileAt,
  mapTileKey,
  mapTileKeysFor,
  placementCandidates,
  placePoint,
  placeSpawns,
  type WalkableTile,
} from '@/game/generation/walkable';
import type { WalkableRules } from '@/content/walkable';

import { useWalkableTiles } from './useWalkableTiles';

/** Placement only depends on the spawn and its map tiles, so each is worked out once. */
const placedById = new Map<string, Spawn | null>();

/**
 * Generated spawns moved onto paths and public areas, for those that could be
 * visible from `position`. Loads the map tiles this needs; a spawn shows up
 * once its tiles are in.
 */
export function usePlacedSpawns(spawns: Spawn[], position: LatLng | null): Spawn[] {
  const candidates = useMemo(() => (position ? placementCandidates(spawns, position) : []), [spawns, position]);
  const keys = useMemo(() => mapTileKeysFor(candidates).sort().join(','), [candidates]);
  const tiles = useWalkableTiles(keys);

  return useMemo(() => {
    if (placedById.size > 5000) placedById.clear();
    return candidates.flatMap((spawn) => {
      const cached = placedById.get(spawn.id);
      if (cached !== undefined) return cached ? [cached] : [];
      const needed = mapTileKeysFor([spawn]);
      if (!needed.every((key) => key in tiles)) return [];
      const placed = placeSpawns([spawn], tiles)[0] ?? null;
      // Spawns placed without their tile (offline) are retried once it loads.
      if (needed.every((key) => tiles[key] !== null)) placedById.set(spawn.id, placed);
      return placed ? [placed] : [];
    });
  }, [candidates, tiles]);
}

/**
 * Any points with an id (Sanctums, treasure) moved onto walkable places with
 * the given rules; items whose tile is still loading or with nowhere walkable
 * near are left out, and so are those `keep` turns down given their map tile
 * (null when it could not be loaded) and placed position.
 */
export function usePlacedPoints<T extends { id: string; position: LatLng }>(
  items: T[],
  rules: WalkableRules,
  keep?: (item: T, tile: WalkableTile | null, position: LatLng) => boolean,
): T[] {
  const keys = useMemo(
    () => [...new Set(items.map((item) => mapTileKey(mapTileAt(item.position, rules.mapZoom))))].sort().join(','),
    [items, rules.mapZoom],
  );
  const tiles = useWalkableTiles(keys);
  return useMemo(
    () =>
      items.flatMap((item) => {
        const position = placePoint(item.position, tiles, rules);
        if (!position) return [];
        if (keep && !keep(item, tiles[mapTileKey(mapTileAt(item.position, rules.mapZoom))], position)) return [];
        return [{ ...item, position }];
      }),
    [items, tiles, rules, keep],
  );
}
