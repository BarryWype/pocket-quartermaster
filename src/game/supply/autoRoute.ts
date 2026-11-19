import { distanceMeters } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from '../places/generate';
import type { SaveData } from '../save';
import { buildingReach } from './buildings';
import { routeProblem, setRoute, stopCart } from './cart';
import { serves, stopPosition } from './planner';
import type { Cart, RoutePoint, StreetPath } from './types';

/**
 * Routes that look after themselves: a new building, or a discovered place
 * that wants what a building on the route makes, joins the route (when the
 * player's setting allows it), and a stop whose time is up leaves it.
 */

/** The route the cart will drive next: the one waiting for the next departure, else the current one. */
export const effectiveRoute = (save: SaveData): RoutePoint[] => save.supply.cart.nextRoute ?? save.supply.cart.route;

/** The street path of the effective route. */
export const effectivePath = (save: SaveData): StreetPath | null =>
  save.supply.cart.nextRoute !== null ? save.supply.cart.nextPath : save.supply.cart.path;

/** Whether two route points name the same stop (a via point by its position). */
export function sameStop(a: RoutePoint, b: RoutePoint): boolean {
  if ('building' in a) return 'building' in b && a.building === b.building;
  if ('place' in a) return 'place' in b && a.place === b.place;
  return 'via' in b && a.via.latitude === b.via.latitude && a.via.longitude === b.via.longitude;
}

export const sameRoute = (a: RoutePoint[], b: RoutePoint[]): boolean => a.length === b.length && a.every((point, i) => sameStop(point, b[i]));

/** The route as it was before an automatic change, for Undo. */
export type RouteSnapshot = { route: RoutePoint[]; path: StreetPath | null };

/**
 * Where a new stop goes in the route: by the Suggest order rule, a place comes
 * after every building of the route that makes what it wants and a building
 * before every place it serves; among the slots left, the one that adds the
 * least distance to the loop. The player's own order of the other stops is kept.
 */
export function insertStop(save: SaveData, route: RoutePoint[], point: RoutePoint): RoutePoint[] {
  const hall = save.supply.hall;
  const at = stopPosition(save, point);
  if (!hall || !at) return [...route, point];
  const centre = tileCenter(hall.cell);
  // Each stop's position; a building gone since stands where the loop was before it.
  const anchors: LatLng[] = [centre];
  for (const stop of route) anchors.push(stopPosition(save, stop) ?? anchors[anchors.length - 1]);
  anchors.push(centre);

  const kindOf = (stop: RoutePoint) => ('building' in stop ? save.supply.buildings.find((b) => b.id === stop.building)?.kind ?? null : null);
  const wantsOf = (stop: RoutePoint) => ('place' in stop ? save.supply.orders[stop.place]?.wants ?? null : undefined);
  let lo = 0;
  let hi = route.length;
  if ('place' in point) {
    const wants = wantsOf(point) ?? null;
    route.forEach((stop, i) => {
      const kind = kindOf(stop);
      if (kind && serves(wants, kind)) lo = i + 1;
    });
  } else if ('building' in point) {
    const kind = kindOf(point);
    const served = kind ? route.findIndex((stop) => 'place' in stop && serves(wantsOf(stop) ?? null, kind)) : -1;
    if (served !== -1) hi = served;
  }

  let best = lo;
  let bestCost = Infinity;
  for (let slot = lo; slot <= Math.max(lo, hi); slot++) {
    const before = anchors[slot];
    const after = anchors[slot + 1];
    const cost = distanceMeters(before, at) + distanceMeters(at, after) - distanceMeters(before, after);
    if (cost < bestCost) {
      best = slot;
      bestCost = cost;
    }
  }
  return [...route.slice(0, best), point, ...route.slice(best)];
}

/** Whether a stop is within the tier's building reach of the hall. */
function inReach(save: SaveData, point: RoutePoint): boolean {
  const hall = save.supply.hall;
  const at = stopPosition(save, point);
  return hall !== null && at !== null && distanceMeters(tileCenter(hall.cell), at) <= buildingReach(save).meters;
}

/**
 * Adds the stops not on the route yet, each at its best slot (see insertStop);
 * stops beyond the hall's reach are left out. With no route yet, the first
 * stop makes one: hall → stop → hall. The path is the straight one until the
 * street path is found. `added` is empty when nothing changed.
 */
export function autoAddStops(save: SaveData, points: RoutePoint[], now: number): { save: SaveData; added: RoutePoint[]; before: RouteSnapshot } {
  const before = { route: effectiveRoute(save), path: effectivePath(save) };
  const added = points.filter((point, i) => !before.route.some((stop) => sameStop(stop, point)) && points.findIndex((p) => sameStop(p, point)) === i && inReach(save, point));
  if (added.length === 0) return { save, added: [], before };
  const route = added.reduce((current, point) => insertStop(save, current, point), before.route);
  if (routeProblem(save, route)) return { save, added: [], before };
  return { save: setRoute(save, route, null, now), added, before };
}

/** The new building as a stop. */
export const autoAddBuilding = (save: SaveData, buildingId: string, now: number) => autoAddStops(save, [{ building: buildingId }], now);

/**
 * The discovered places worth adding: each has a live order that a building
 * already on the route makes something for (a market: any building).
 */
export function placesForRoute(save: SaveData, places: PlaceSpawn[], now: number): RoutePoint[] {
  const kinds = effectiveRoute(save).flatMap((stop) => {
    if (!('building' in stop)) return [];
    const building = save.supply.buildings.find((b) => b.id === stop.building);
    return building ? [building.kind] : [];
  });
  return places
    .filter((place) => {
      const order = save.supply.orders[place.id];
      return order !== undefined && order.expiresAt > now && kinds.some((kind) => serves(order.wants, kind));
    })
    .map((place) => ({ place: place.id, position: place.position }));
}

/** Whether a stop's time is up: its building is gone, or its place's order has left. */
const isDead = (save: SaveData, point: RoutePoint, now: number): boolean => {
  if ('building' in point) return !save.supply.buildings.some((b) => b.id === point.building);
  if ('place' in point) return (save.supply.orders[point.place]?.expiresAt ?? 0) <= now;
  return false;
};

/**
 * One route without its dead stops. The street path keeps its points (the cart
 * drives past where the stop was until the path is found again) and drops the
 * stops' marks; a route with no stop left is emptied.
 */
function pruned(save: SaveData, route: RoutePoint[], path: StreetPath | null, now: number) {
  const dead = route.map((point) => isDead(save, point, now));
  if (!dead.includes(true)) return null;
  const kept = route.filter((_, i) => !dead[i]);
  if (!kept.some((point) => 'building' in point || 'place' in point)) return { route: [] as RoutePoint[], path: null, removed: route.filter((_, i) => dead[i]) };
  const keptPath = path && path.stopAt.length === route.length ? { ...path, stopAt: path.stopAt.filter((_, i) => !dead[i]) } : null;
  return { route: kept, path: keptPath, removed: route.filter((_, i) => dead[i]) };
}

/**
 * Takes the stops whose time is up off the route (and off the route waiting
 * for the next departure). The loop under way keeps its course. `removed` lists
 * the stops that left the route the cart will drive next.
 */
export function pruneRoute(save: SaveData, now: number): { save: SaveData; removed: RoutePoint[] } {
  const cart = save.supply.cart;
  const current = pruned(save, cart.route, cart.path, now);
  const waiting = cart.nextRoute !== null ? pruned(save, cart.nextRoute, cart.nextPath, now) : null;
  if (!current && !waiting) return { save, removed: [] };
  const next: Cart = {
    ...cart,
    ...(current && { route: current.route, path: current.path }),
    ...(waiting && { nextRoute: waiting.route, nextPath: waiting.path }),
  };
  const removed = cart.nextRoute !== null ? (waiting?.removed ?? []) : (current?.removed ?? []);
  return { save: { ...save, supply: { ...save.supply, cart: next } }, removed };
}

/** Puts the route back as it was before an automatic change (an empty one parks the cart); one that can no longer be set stays as it is. */
export function restoreRoute(save: SaveData, snapshot: RouteSnapshot, now: number): SaveData {
  if (snapshot.route.length === 0) return stopCart(save, now);
  if (routeProblem(save, snapshot.route)) return save;
  return setRoute(save, snapshot.route, snapshot.path, now);
}
