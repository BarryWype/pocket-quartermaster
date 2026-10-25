import { resources as defaultResources } from '@/content/resources';
import { spawnConfig as defaultConfig } from '@/content/spawnConfig';

import { createAnimalPath } from './animalPaths';
import { createRng } from './rng';
import { randomPointInTile, tileCenter, tilesAround } from './tiles';
import { timeOfDayAt, windowIndex, windowRange } from './time';
import type { LatLng, ResourceDef, ResourceKind, Spawn, SpawnConfig, TimeOfDay } from './types';

export type GenerationOptions = {
  config?: SpawnConfig;
  resources?: ResourceDef[];
  /** Debug override; otherwise derived from the window start and the tile's longitude. */
  timeOfDay?: TimeOfDay;
};

const KINDS: ResourceKind[] = ['wood', 'ore', 'animal', 'herb'];

export function generateTileSpawns(
  kind: ResourceKind,
  tile: string,
  window: number,
  options: GenerationOptions = {},
): Spawn[] {
  const config = options.config ?? defaultConfig;
  const kindConfig = config.kinds[kind];
  const candidates = (options.resources ?? defaultResources).filter((r) => r.kind === kind);
  const rng = createRng(`${kind}|${tile}|${window}`);

  if (candidates.length === 0 || !rng.chance(kindConfig.tileChance)) return [];

  const { start, end } = windowRange(window, kindConfig.windowMinutes);
  const timeOfDay =
    options.timeOfDay ?? timeOfDayAt(start, tileCenter(tile).longitude, config.timeOfDay);
  const boostOf = (resource: ResourceDef) => resource.boosts?.[timeOfDay] ?? 1;

  const count = rng.int(kindConfig.minPerTile, kindConfig.maxPerTile);
  return Array.from({ length: count }, (_, i): Spawn => {
    const resource = rng.weighted(candidates, (r) => r.weight * boostOf(r));
    const boosted = boostOf(resource) > 1;
    const base = {
      id: `${kind}:${tile}:${window}:${i}`,
      resourceId: resource.id,
      tile,
      quantity: rng.int(1, kindConfig.maxQuantity),
      boosted,
      expiresAt: end,
    };
    if (kind === 'animal') {
      const { waypoints, loopMinutes } = config.animal;
      return { ...base, kind, path: createAnimalPath(tile, rng, waypoints, loopMinutes) };
    }
    return { ...base, kind, position: randomPointInTile(tile, rng) };
  });
}

/** All spawns in the tiles around a position, for every resource kind. */
export function generateSpawnsAround(
  position: LatLng,
  timeMs: number,
  options: GenerationOptions = {},
): Spawn[] {
  const config = options.config ?? defaultConfig;
  return KINDS.flatMap((kind) => {
    const { precision, windowMinutes } = config.kinds[kind];
    const window = windowIndex(timeMs, windowMinutes);
    return tilesAround(position, precision).flatMap((tile) =>
      generateTileSpawns(kind, tile, window, options),
    );
  });
}
