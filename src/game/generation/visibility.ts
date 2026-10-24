import { spawnConfig as defaultConfig } from '@/content/spawnConfig';

import { spawnPositionAt } from './animalPaths';
import { distanceMeters } from './geo';
import type { LatLng, Spawn, SpawnConfig } from './types';

export type VisibleSpawn = {
  spawn: Spawn;
  position: LatLng;
  distance: number;
};

/** Spawns within their kind's visibility range of the player, at the given time. */
export function visibleSpawns(
  spawns: Spawn[],
  player: LatLng,
  timeMs: number,
  config: SpawnConfig = defaultConfig,
): VisibleSpawn[] {
  return spawns
    .map((spawn) => {
      const position = spawnPositionAt(spawn, timeMs);
      return { spawn, position, distance: distanceMeters(player, position) };
    })
    .filter(({ spawn, distance }) => distance <= config.kinds[spawn.kind].visibilityMeters);
}
