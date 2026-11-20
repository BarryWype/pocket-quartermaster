import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import type { WalkableTile } from '@/game/generation/walkable';
import type { SaveData } from '@/game/save';
import { buildingReach } from '@/game/supply/buildings';
import { routeStops } from '@/game/supply/cart';
import { buildStreetGraph, routeStreetPath, snapToStreet, streetTileKeys, type StreetGraph } from '@/game/supply/streets';
import type { RoutePoint, StreetPath } from '@/game/supply/types';

import { walkableTiles } from './mapTiles';

/** The last built graph, with the tile keys it was built from: reused while the keys don't change. */
let lastGraph: { keys: string; graph: StreetGraph } | null = null;

/** The street graph over the hall's reach, built once per distinct set of tiles. */
async function graphFor(centre: LatLng, reach: number): Promise<StreetGraph> {
  const keys = streetTileKeys(centre, reach);
  const memoKey = keys.join('|');
  if (lastGraph?.keys === memoKey) return lastGraph.graph;
  const tiles = (await Promise.all(keys.map((tileKey) => walkableTiles.load(tileKey)))).filter((tile): tile is WalkableTile => tile !== null);
  const graph = buildStreetGraph(tiles);
  lastGraph = { keys: memoKey, graph };
  return graph;
}

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
  return routeStreetPath(await graphFor(centre, buildingReach(save).meters), centre, positions);
}

/** Where a dropped grab point lands: the nearest street point, or where it was dropped when no street is near. */
export async function snapGrab(save: SaveData, at: LatLng): Promise<LatLng> {
  const hall = save.supply.hall;
  if (!hall) return at;
  return snapToStreet(await graphFor(tileCenter(hall.cell), buildingReach(save).meters), at) ?? at;
}
