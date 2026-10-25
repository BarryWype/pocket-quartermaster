import { gatheringConfig, type GatheringConfig } from '@/content/gatheringConfig';
import { itemById } from '@/content/lookup';
import { resources as defaultResources } from '@/content/resources';

import { spawnPositionAt } from '../generation/animalPaths';
import { distanceMeters } from '../generation/geo';
import type { LatLng, ResourceDef, Spawn } from '../generation/types';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import { limitsToWood } from '../tutorial/tutorial';
import type { MaterialStack } from '../types';

export type CollectFailure = 'collected' | 'expired' | 'needsTool' | 'tooFar' | 'fled';

export type CollectResult =
  | { ok: true; save: SaveData; gained: MaterialStack[] }
  | { ok: false; reason: CollectFailure; distance: number };

export type Gatherer = {
  position: LatLng;
  /** Metres per second, null when unknown. */
  speed: number | null;
};

type Options = {
  config?: GatheringConfig;
  resources?: ResourceDef[];
};

/** Highest pickaxe tier the player owns, 0 without one. */
export function pickaxeTier(save: SaveData) {
  return save.tools.reduce((best, toolId) => {
    const item = itemById[toolId];
    return item.slot === 'tool' && item.toolType === 'pickaxe' ? Math.max(best, item.tier) : best;
  }, 0);
}

/**
 * Whether the player may see and gather a spawn: only wood early in the
 * tutorial, then anything their pickaxe can handle.
 */
export function canGather(save: SaveData, spawn: Spawn, resources: ResourceDef[] = defaultResources) {
  if (limitsToWood(save)) return spawn.kind === 'wood';
  const resource = resources.find((r) => r.id === spawn.resourceId);
  return (resource?.pickaxeTier ?? 0) <= pickaxeTier(save);
}

export function isFleeing(speed: number | null, config: GatheringConfig = gatheringConfig) {
  return (speed ?? 0) > config.animalFleeSpeed;
}

export function spawnYield(spawn: Spawn, resources: ResourceDef[] = defaultResources) {
  const resource = resources.find((r) => r.id === spawn.resourceId);
  if (!resource) throw new Error(`Unknown resource ${spawn.resourceId}`);
  return resource.yields.map((y) => ({ materialId: y.materialId, amount: y.amount * spawn.quantity }));
}

/** Drops collected-spawn entries whose window has ended. */
export function pruneCollected(collected: Record<string, number>, timeMs: number) {
  return Object.fromEntries(Object.entries(collected).filter(([, expiresAt]) => expiresAt > timeMs));
}

export function collectSpawn(
  save: SaveData,
  spawn: Spawn,
  gatherer: Gatherer,
  timeMs: number,
  { config = gatheringConfig, resources = defaultResources }: Options = {},
): CollectResult {
  const distance = distanceMeters(gatherer.position, spawnPositionAt(spawn, timeMs));

  if (spawn.id in save.collected) return { ok: false, reason: 'collected', distance };
  if (spawn.expiresAt <= timeMs) return { ok: false, reason: 'expired', distance };
  if (!canGather(save, spawn, resources)) return { ok: false, reason: 'needsTool', distance };
  if (distance > config.collectRadiusMeters) return { ok: false, reason: 'tooFar', distance };
  if (spawn.kind === 'animal' && isFleeing(gatherer.speed, config)) {
    return { ok: false, reason: 'fled', distance };
  }

  const gained = spawnYield(spawn, resources);
  return {
    ok: true,
    gained,
    save: {
      ...save,
      materials: addMaterials(save.materials, gained),
      collected: { ...pruneCollected(save.collected, timeMs), [spawn.id]: spawn.expiresAt },
    },
  };
}
