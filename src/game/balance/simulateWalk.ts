import { gatheringConfig, type GatheringConfig } from '@/content/gatheringConfig';

import { processWalkPath, type WalkFix } from '../gathering/autoGather';
import { canGather, collectSpawn } from '../gathering/gathering';
import { distanceMeters, interpolate } from '../generation/geo';
import { generateSpawnsAround } from '../generation/spawns';
import type { LatLng, Spawn } from '../generation/types';
import { visibleSpawns } from '../generation/visibility';
import type { SaveData } from '../save';

const WALK_SPEED = 1.4;
const TICK_SECONDS = 5;

/**
 * A player who walks towards the nearest visible spawn and gathers it, used to
 * check how much a walk of a given length yields with the tools in `save`.
 * Wanders in a straight line when nothing is visible. The config's gathering
 * rules apply; pass a bonus-less one to measure base yields (the simulator
 * applies the walking bonus itself).
 */
export function simulateWalk(
  save: SaveData,
  start: LatLng,
  startMs: number,
  minutes: number,
  config: GatheringConfig = gatheringConfig,
  /** Called with each spawn that shows on the map during the walk, locked ones included (once per spawn id). */
  onVisible: (spawn: Spawn) => void = () => {},
): SaveData {
  let position = start;
  let heading = { north: 1, east: 0.3 };
  const seen = new Set<string>();

  for (let t = 0; t < minutes * 60; t += TICK_SECONDS) {
    const now = startMs + t * 1000;
    const visible = visibleSpawns(generateSpawnsAround(position, now), position, now)
      .filter(({ spawn }) => !(spawn.id in save.collected))
      .sort((a, b) => a.distance - b.distance);
    for (const { spawn } of visible) {
      if (!seen.has(spawn.id)) {
        seen.add(spawn.id);
        onVisible(spawn);
      }
    }
    const gatherable = visible.filter(({ spawn }) => canGather(save, spawn));

    for (const { spawn, distance } of gatherable) {
      if (distance > gatheringConfig.collectRadiusMeters) break;
      const result = collectSpawn(save, spawn, { position, speed: WALK_SPEED }, now, { config });
      if (result.ok) save = result.save;
    }

    const step = WALK_SPEED * TICK_SECONDS;
    const target = gatherable.find(({ distance }) => distance > gatheringConfig.collectRadiusMeters);
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

/**
 * A pocket walk with auto-gather on: the same wander as `simulateWalk` from
 * the same start, but never turning towards a node. Its fixes go through the
 * real auto-gather rules (`processWalkPath`), so only nodes the path passes
 * within the auto radius are collected.
 */
export function simulateAutoWalk(
  save: SaveData,
  start: LatLng,
  startMs: number,
  minutes: number,
  config: GatheringConfig = gatheringConfig,
): SaveData {
  const fixes: WalkFix[] = [];
  let position = start;
  let heading = { north: 1, east: 0.3 };
  const metresPerDegree = 111_320;
  for (let t = 0; t <= minutes * 60; t += TICK_SECONDS) {
    fixes.push({ position, accuracy: 5, timestamp: startMs + t * 1000, stepsCounted: true });
    const step = WALK_SPEED * TICK_SECONDS;
    position = {
      latitude: position.latitude + (heading.north * step) / metresPerDegree,
      longitude: position.longitude + (heading.east * step) / (metresPerDegree * Math.cos((position.latitude * Math.PI) / 180)),
    };
    if (t % 600 === 0) heading = { north: heading.east, east: -heading.north };
  }
  return processWalkPath(save, fixes, { config }).save;
}
