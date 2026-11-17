import { useEffect, useState } from 'react';

import { tileCenter } from '@/game/generation/tiles';
import type { WalkableTile } from '@/game/generation/walkable';
import { buildingReach } from '@/game/supply/buildings';
import { routeStops } from '@/game/supply/cart';
import { buildStreetGraph, routeStreetPath, streetTileKeys, type StreetGraph } from '@/game/supply/streets';
import type { RoutePoint, StreetPath } from '@/game/supply/types';
import { walkableTiles } from '@/services/mapTiles';
import { useGameStore } from '@/store/gameStore';

/** The last built graph, with the tile keys it was built from: reused while the keys don't change. */
let lastGraph: { keys: string; graph: StreetGraph } | null = null;

/**
 * The street path of a route, found off the press: the tiles the hall's reach
 * covers are loaded (null tiles skipped), the graph built once per distinct
 * key set, and the path run from the hall through the stops. `finding` is true
 * while it runs; the last found path stays up meanwhile, and both go away with
 * the route.
 */
export function useStreetPath(route: RoutePoint[]): { path: StreetPath | null; finding: boolean; straightLegs: number[] } {
  const save = useGameStore((s) => s.save);
  const hall = save.supply.hall;
  const centre = hall ? tileCenter(hall.cell) : null;
  const reach = buildingReach(save).meters;
  const positions = routeStops(save, route).flatMap((stop) => (stop.at ? [stop.at] : []));
  const active = centre !== null && route.length > 0;
  // What the search reads, not the save: most store writes leave the path alone.
  const key =
    active
      ? `${centre!.latitude},${centre!.longitude};${reach};${positions.map((at) => `${at.latitude},${at.longitude}`).join(';')}`
      : '';
  const [found, setFound] = useState<{ path: StreetPath | null; finding: boolean }>({ path: null, finding: false });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setFound((current) => ({ path: current.path, finding: true }));
      void (async () => {
        const keys = streetTileKeys(centre!, reach);
        const memoKey = keys.join('|');
        const graph =
          lastGraph?.keys === memoKey
            ? lastGraph.graph
            : buildStreetGraph(
                (await Promise.all(keys.map((tileKey) => walkableTiles.load(tileKey)))).filter(
                  (tile): tile is WalkableTile => tile !== null,
                ),
              );
        if (cancelled) return;
        lastGraph = { keys: memoKey, graph };
        setFound({ path: routeStreetPath(graph, centre!, positions), finding: false });
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    path: active ? found.path : null,
    finding: active && found.finding,
    straightLegs: (active ? found.path?.straightLegs : undefined) ?? [],
  };
}
