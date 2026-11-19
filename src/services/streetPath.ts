import { tileCenter } from '@/game/generation/tiles';
import type { WalkableTile } from '@/game/generation/walkable';
import type { SaveData } from '@/game/save';
import { buildingReach } from '@/game/supply/buildings';
import { routeStops } from '@/game/supply/cart';
import { buildStreetGraph, routeStreetPath, streetTileKeys, type StreetGraph } from '@/game/supply/streets';
import type { RoutePoint, StreetPath } from '@/game/supply/types';

import { walkableTiles } from './mapTiles';

/** The last built graph, with the tile keys it was built from: reused while the keys don't change. */
let lastGraph: { keys: string; graph: StreetGraph } | null = null;

/**
 * The street path of a route: the tiles the hall's reach covers are loaded
 * (null tiles skipped), the graph built once per distinct key set, and the path
 * run from the hall through the stops. Null with no hall or no route.
 */
export async function findStreetPath(save: SaveData, route: RoutePoint[]): Promise<StreetPath | null> {
  const hall = save.supply.hall;
  if (!hall || route.length === 0) return null;
  const centre = tileCenter(hall.cell);
  const positions = routeStops(save, route).flatMap((stop) => (stop.at ? [stop.at] : []));
  const keys = streetTileKeys(centre, buildingReach(save).meters);
  const memoKey = keys.join('|');
  const graph =
    lastGraph?.keys === memoKey
      ? lastGraph.graph
      : buildStreetGraph(
          (await Promise.all(keys.map((tileKey) => walkableTiles.load(tileKey)))).filter((tile): tile is WalkableTile => tile !== null),
        );
  lastGraph = { keys: memoKey, graph };
  return routeStreetPath(graph, centre, positions);
}
