import { useEffect, useState } from 'react';

import type { WalkableTile } from '@/game/generation/walkable';
import { walkableTiles } from '@/services/mapTiles';

/**
 * Loads the map tiles behind these keys (comma-separated, so the effect only
 * reruns when the set changes). Failed tiles come back as null.
 */
export function useWalkableTiles(keys: string): Record<string, WalkableTile | null> {
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

  return tiles;
}
