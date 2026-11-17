import { supplyRules } from '@/content/supplyLines';

import { distanceMeters } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import type { PlaceSpawn } from '../places/generate';
import type { SaveData } from '../save';
import { buildingReach } from './buildings';
import { networkPlacesAround } from './discovery';
import type { Building, BuildingKind, RoutePoint } from './types';

/** The goods a building kind makes. */
const makes = (kind: BuildingKind): string[] => Object.keys(supplyRules.buildings.kinds[kind].makes);

/** Whether a building of `kind` serves a place that wants `wants` (null: a market, served by any building). */
const serves = (wants: Record<string, number> | null, kind: BuildingKind): boolean =>
  wants === null || makes(kind).some((good) => (wants[good] ?? 0) > 0);

/** One stop of the tour: its route point, where it stands, and what a place it is wants. */
type TourStop = { point: RoutePoint; at: ReturnType<typeof stopPosition>; wants: Record<string, number> | null; buildingKind: BuildingKind | null };

/**
 * A nearest-next tour from the hall: at each step the nearest stop that may be
 * visited — a place waits until a building in the route that makes one of its
 * wanted goods (any building for a market) has been visited, when the route
 * holds one. Via points keep their place at the end, in their order. Never
 * adds or removes a stop.
 */
export function suggestOrder(save: SaveData, route: RoutePoint[]): RoutePoint[] {
  const hall = save.supply.hall;
  if (!hall) return route;
  const vias = route.filter((point) => !('building' in point) && !('place' in point));
  const stops: TourStop[] = route.flatMap((point): TourStop[] => {
    if ('building' in point) {
      const building = save.supply.buildings.find((b) => b.id === point.building);
      return [{ point, at: building?.position ?? null, wants: null, buildingKind: building?.kind ?? null }];
    }
    if ('place' in point) return [{ point, at: point.position, wants: save.supply.orders[point.place]?.wants ?? null, buildingKind: null }];
    return [];
  });
  let current = tileCenter(hall.cell);
  const left = [...stops];
  const ordered: RoutePoint[] = [];
  while (left.length > 0) {
    // A place is held back only while a building of the route that serves it is still unvisited.
    const eligible = left.filter(
      (stop) =>
        stop.buildingKind !== null ||
        !left.some((other) => other.buildingKind !== null && serves(stop.wants, other.buildingKind)),
    );
    const pool = eligible.length > 0 ? eligible : left;
    const pick = pool.reduce((best, stop) =>
      best !== null && (best.at ? distanceMeters(current, best.at) : Infinity) <= (stop.at ? distanceMeters(current, stop.at) : Infinity) ? best : stop,
    );
    ordered.push(pick.point);
    left.splice(left.indexOf(pick), 1);
    if (pick.at) current = pick.at;
  }
  return [...ordered, ...vias];
}

/** One stop the planner can pick: a building, or a discovered place with a live order. */
export type PlannerStop =
  | { kind: 'building'; building: Building; point: RoutePoint; expiresAt: number }
  | { kind: 'place'; place: PlaceSpawn; point: RoutePoint; expiresAt: number };

/**
 * Every building and every discovered place with a live order within the
 * tier's building reach of the hall, buildings first, places by distance.
 */
export function plannerStops(save: SaveData, now: number): PlannerStop[] {
  const hall = save.supply.hall;
  if (!hall) return [];
  const centre = tileCenter(hall.cell);
  const reach = buildingReach(save).meters;
  const buildings = save.supply.buildings
    .filter((building) => distanceMeters(centre, building.position) <= reach)
    .map((building): PlannerStop => ({ kind: 'building', building, point: { building: building.id }, expiresAt: building.expiresAt }));
  const places = networkPlacesAround(save, centre, now)
    .filter((place) => place.id in save.supply.discovered && (save.supply.orders[place.id]?.expiresAt ?? 0) > now)
    .filter((place) => distanceMeters(centre, place.position) <= reach)
    .sort((a, b) => distanceMeters(centre, a.position) - distanceMeters(centre, b.position))
    .map((place): PlannerStop => ({ kind: 'place', place, point: { place: place.id, position: place.position }, expiresAt: place.expiresAt }));
  return [...buildings, ...places];
}

/** A stop's position: a building's, a place's stored one, or a via point's. */
export function stopPosition(save: SaveData, point: RoutePoint) {
  if ('building' in point) return save.supply.buildings.find((b) => b.id === point.building)?.position ?? null;
  if ('place' in point) return point.position;
  return point.via;
}
