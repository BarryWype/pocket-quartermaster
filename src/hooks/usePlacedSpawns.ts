import { useEffect, useMemo, useState } from 'react';

import type { LatLng, Spawn } from '@/game/generation/types';
import {
  mapTileKeysFor,
  placementCandidates,
  placeSpawns,
  type WalkableTile,
} from '@/game/generation/walkable';
import { walkableTiles } from '@/services/mapTiles';

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
  const [tiles, setTiles] = useState<Record<string, WalkableTile | null>>({});

  useEffect(() => {
    let cancelled = false;
    for (const key of keys.split(',').filter(Boolean)) {
      walkableTiles.load(key).then((tile) => {
        if (!cancelled) setTiles((current) => (current[key] === tile ? current : { ...current, [key]: tile }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [keys]);

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
