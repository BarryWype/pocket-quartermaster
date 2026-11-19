import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';

/** A marker the map shows, by id and where it stands. */
export type MapHit = { id: string; position: LatLng };

/** How many metres one screen point covers at a latitude and zoom (MapLibre's 512-point tiles). */
export function metersPerPoint(latitude: number, zoom: number): number {
  return (78_271.517 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/** Two marker tiles overlap when their centres are closer than this many points (a marker is 44 points wide). */
export const OVERLAP_POINTS = 40;

/**
 * The markers a tap on `hit` also lands on: every other marker whose centre is
 * within `OVERLAP_POINTS` of it on screen, nearest first, after the tapped one.
 * One entry means no overlap, and the tapped marker opens as before.
 */
export function overlapping(hit: MapHit, markers: MapHit[], metersPerPt: number, points = OVERLAP_POINTS): MapHit[] {
  const reach = points * metersPerPt;
  const near = markers
    .filter((marker) => marker.id !== hit.id)
    .map((marker) => ({ marker, meters: distanceMeters(hit.position, marker.position) }))
    .filter(({ meters }) => meters <= reach)
    .sort((a, b) => a.meters - b.meters)
    .map(({ marker }) => marker);
  return [hit, ...near];
}
