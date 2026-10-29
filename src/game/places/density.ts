import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from './generate';

const nearestBy = (spawns: PlaceSpawn[], position: LatLng, keyOf: (spawn: PlaceSpawn) => string): Record<string, number> => {
  const nearest: Record<string, number> = {};
  for (const spawn of spawns) {
    const key = keyOf(spawn);
    const d = distanceMeters(position, spawn.position);
    if (nearest[key] === undefined || d < nearest[key]) nearest[key] = d;
  }
  return nearest;
};

/** Group id → distance in metres of the nearest spawn of that group. */
export function nearestByGroup(spawns: PlaceSpawn[], position: LatLng): Record<string, number> {
  return nearestBy(spawns, position, (spawn) => spawn.group);
}

/** Kind → distance in metres of the nearest spawn of that kind. */
export function nearestByKind(spawns: PlaceSpawn[], position: LatLng): Record<string, number> {
  return nearestBy(spawns, position, (spawn) => spawn.kind);
}
