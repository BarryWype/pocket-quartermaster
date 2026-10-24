import { distanceMeters, interpolate } from './geo';
import type { Rng } from './rng';
import { randomPointInTile } from './tiles';
import type { AnimalPath, LatLng, Spawn } from './types';

export function createAnimalPath(
  tile: string,
  rng: Rng,
  waypointCount: number,
  loopMinutes: number,
): AnimalPath {
  const waypoints = Array.from({ length: waypointCount }, () => randomPointInTile(tile, rng));
  const loopMs = loopMinutes * 60_000;
  return { waypoints, loopMs, phaseMs: Math.floor(rng.next() * loopMs) };
}

/** Position along a closed loop through the waypoints, at constant speed. */
export function animalPositionAt(path: AnimalPath, timeMs: number): LatLng {
  const { waypoints, loopMs, phaseMs } = path;
  if (waypoints.length === 1) return waypoints[0];

  const segments = waypoints.map((from, i) => {
    const to = waypoints[(i + 1) % waypoints.length];
    return { from, to, length: distanceMeters(from, to) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total === 0) return waypoints[0];

  const progress = (((timeMs + phaseMs) % loopMs) + loopMs) % loopMs;
  let remaining = (progress / loopMs) * total;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      return interpolate(segment.from, segment.to, segment.length === 0 ? 0 : remaining / segment.length);
    }
    remaining -= segment.length;
  }
  return waypoints[0];
}

export function spawnPositionAt(spawn: Spawn, timeMs: number): LatLng {
  return spawn.kind === 'animal' ? animalPositionAt(spawn.path, timeMs) : spawn.position;
}
