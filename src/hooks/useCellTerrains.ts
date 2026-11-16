import { useEffect, useMemo, useState } from 'react';

import { cellTerrain, cellTileKeys } from '@/game/supply/terrain';
import type { Terrain } from '@/game/supply/types';
import { walkableTiles } from '@/services/mapTiles';

/** Each cell's classified terrain, kept for the session: only defined results are cached. */
const terrainCache = new Map<string, Terrain | 'water'>();
/** Cells whose tiles are loading, so a re-render doesn't start a second load. */
const pending = new Set<string>();

/**
 * The terrain of each cell, loading its map tiles on first sight. The result is
 * cached by cell, so panning back costs nothing; cells whose tiles are still
 * loading (or failed) stay undefined until a later call classifies them.
 */
export function useCellTerrains(cells: string[]): Record<string, Terrain | 'water' | undefined> {
  const key = cells.join(',');
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    let cancelled = false;
    for (const cell of cells) {
      if (terrainCache.has(cell) || pending.has(cell)) continue;
      pending.add(cell);
      const keys = cellTileKeys(cell);
      Promise.all(keys.map((tileKey) => walkableTiles.load(tileKey))).then((tiles) => {
        pending.delete(cell);
        const terrain = cellTerrain(cell, Object.fromEntries(keys.map((tileKey, i) => [tileKey, tiles[i]])));
        if (terrain !== undefined) terrainCache.set(cell, terrain);
        if (!cancelled) setLoaded((n) => n + 1);
      });
    }
    return () => {
      cancelled = true;
    };
    // The cells list is keyed by its joined form: a new array of the same cells starts nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Object.fromEntries(cells.map((cell) => [cell, terrainCache.get(cell)])), [key, loaded]);
}
