import type { LatLng } from '../generation/types';
import { sameStop } from './autoRoute';
import type { RoutePoint, StreetPath } from './types';

/**
 * Route mode's edits on a draft route: pins add and remove stops, chips
 * reorder them, and grab points (via points) bend the route through a street.
 */

/** Whether the point is a stop (a building or a place), not a grab point. */
export const isStop = (point: RoutePoint): boolean => 'building' in point || 'place' in point;

/** A tapped pin: off the route if it is on it, else on as the last stop. */
export function toggleStop(draft: RoutePoint[], point: RoutePoint): RoutePoint[] {
  return draft.some((stop) => sameStop(stop, point)) ? draft.filter((stop) => !sameStop(stop, point)) : [...draft, point];
}

/** The draft with the point at `from` moved to `to` (indexes in the whole draft, grab points included). */
export function moveStop(draft: RoutePoint[], from: number, to: number): RoutePoint[] {
  if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length) return draft;
  const next = [...draft];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Moves the stop at `from` one stop earlier or later: it jumps over the next
 * stop in that direction, grab points staying on their legs.
 */
export function shiftStop(draft: RoutePoint[], from: number, by: -1 | 1): RoutePoint[] {
  let to = from + by;
  while (to >= 0 && to < draft.length && !isStop(draft[to])) to += by;
  if (to < 0 || to >= draft.length) return draft;
  const next = [...draft];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Metres east and north of `origin`, near enough flat at a town's scale. */
function local(origin: LatLng, point: LatLng): { x: number; y: number } {
  const metresPerDegree = 111_320;
  return {
    x: (point.longitude - origin.longitude) * metresPerDegree * Math.cos((origin.latitude * Math.PI) / 180),
    y: (point.latitude - origin.latitude) * metresPerDegree,
  };
}

/**
 * Where a tap lands on the drawn route: the nearest point of the path, how far
 * the tap was from it, and the leg it is on — leg 0 runs from the hall to the
 * first route point, leg i from route point i - 1 to route point i. Null for a
 * path with no segment.
 */
export function legAt(path: StreetPath, at: LatLng): { leg: number; point: LatLng; meters: number } | null {
  let best: { segment: number; t: number; meters: number } | null = null;
  for (let k = 0; k + 1 < path.points.length; k++) {
    const a = local(at, path.points[k]);
    const b = local(at, path.points[k + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / length2));
    const meters = Math.hypot(a.x + dx * t, a.y + dy * t);
    if (!best || meters < best.meters) best = { segment: k, t, meters };
  }
  if (!best) return null;
  const a = path.points[best.segment];
  const b = path.points[best.segment + 1];
  // The leg: how many route points the path has passed by the segment's start.
  const leg = path.stopAt.filter((index) => index <= best.segment).length;
  return {
    leg,
    point: { latitude: a.latitude + (b.latitude - a.latitude) * best.t, longitude: a.longitude + (b.longitude - a.longitude) * best.t },
    meters: best.meters,
  };
}

/** A grab point on leg `leg`: a via point between the route points that leg joins. */
export function addGrab(draft: RoutePoint[], leg: number, at: LatLng): RoutePoint[] {
  const index = Math.max(0, Math.min(draft.length, leg));
  return [...draft.slice(0, index), { via: at }, ...draft.slice(index)];
}

/** The grab point at `index` moved to `at` (where it snapped on release). */
export function moveGrab(draft: RoutePoint[], index: number, at: LatLng): RoutePoint[] {
  if (!draft[index] || isStop(draft[index])) return draft;
  return draft.map((point, i) => (i === index ? { via: at } : point));
}

/** The draft without the point at `index`. */
export const removeAt = (draft: RoutePoint[], index: number): RoutePoint[] => draft.filter((_, i) => i !== index);

/**
 * Where a chip dragged `dx` points sideways lands among the chips: each
 * chip's left edge and width, in order; the dragged chip goes before the
 * first chip whose middle its own middle has not passed.
 */
export function dropIndex(chips: { x: number; width: number }[], from: number, dx: number): number {
  const dragged = chips[from];
  if (!dragged) return from;
  const middle = dragged.x + dragged.width / 2 + dx;
  const others = chips.filter((_, i) => i !== from);
  const before = others.findIndex((chip) => middle < chip.x + chip.width / 2);
  return before === -1 ? others.length : before;
}

/**
 * The draft with its stops reordered: the stop that was `from`-th goes `to`-th
 * among the stops, and the grab points keep their slots in the draft.
 */
export function reorderStops(draft: RoutePoint[], from: number, to: number): RoutePoint[] {
  const stops = draft.filter(isStop);
  if (from === to || !stops[from] || to < 0 || to >= stops.length) return draft;
  const [moved] = stops.splice(from, 1);
  stops.splice(to, 0, moved);
  let next = 0;
  return draft.map((point) => (isStop(point) ? stops[next++] : point));
}
