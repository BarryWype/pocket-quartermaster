import { gatheringConfig } from '@/content/gatheringConfig';

import { canGather, collectSpawn } from '../gathering/gathering';
import { distanceMeters, interpolate } from '../generation/geo';
import { generateSpawnsAround } from '../generation/spawns';
import type { LatLng } from '../generation/types';
import { visibleSpawns } from '../generation/visibility';
import type { SaveData } from '../save';

const WALK_SPEED = 1.4;
const TICK_SECONDS = 5;

/**
 * A player who walks towards the nearest visible spawn and gathers it, used to
 * check how much a walk of a given length yields with the tools in `save`.
 * Wanders in a straight line when nothing is visible.
 */
export function simulateWalk(save: SaveData, start: LatLng, startMs: number, minutes: number): SaveData {
  let position = start;
  let heading = { north: 1, east: 0.3 };

  for (let t = 0; t < minutes * 60; t += TICK_SECONDS) {
    const now = startMs + t * 1000;
    const visible = visibleSpawns(generateSpawnsAround(position, now), position, now)
      .filter(({ spawn }) => !(spawn.id in save.collected) && canGather(save, spawn))
      .sort((a, b) => a.distance - b.distance);

    for (const { spawn, distance } of visible) {
      if (distance > gatheringConfig.collectRadiusMeters) break;
      const result = collectSpawn(save, spawn, { position, speed: WALK_SPEED }, now);
      if (result.ok) save = result.save;
    }

    const step = WALK_SPEED * TICK_SECONDS;
    const target = visible.find(({ distance }) => distance > gatheringConfig.collectRadiusMeters);
    if (target) {
      position = interpolate(position, target.position, Math.min(1, step / distanceMeters(position, target.position)));
    } else {
      const metresPerDegree = 111_320;
      position = {
        latitude: position.latitude + (heading.north * step) / metresPerDegree,
        longitude:
          position.longitude +
          (heading.east * step) / (metresPerDegree * Math.cos((position.latitude * Math.PI) / 180)),
      };
    }
    if (t % 600 === 0) heading = { north: heading.east, east: -heading.north };
  }
  return save;
}
