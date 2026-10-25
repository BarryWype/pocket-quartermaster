import { gatheringConfig, type GatheringConfig } from '@/content/gatheringConfig';
import { resources as defaultResources } from '@/content/resources';

import { spawnPositionAt } from '../generation/animalPaths';
import { distanceMeters } from '../generation/geo';
import type { LatLng, ResourceDef, Spawn } from '../generation/types';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import { bestPickaxe, canGather } from '../tools';
import type { MaterialStack } from '../types';

export type CollectFailure = 'collected' | 'expired' | 'tooFar' | 'fled' | 'needsPickaxe';

export type CollectResult =
  | { ok: true; save: SaveData; gained: MaterialStack[] }
  | { ok: false; reason: CollectFailure; distance: number; requiredPickaxe?: number };

export type Gatherer = {
  position: LatLng;
  /** Metres per second, null when unknown. */
  speed: number | null;
};

type Options = {
  config?: GatheringConfig;
  resources?: ResourceDef[];
};

export function isFleeing(speed: number | null, config: GatheringConfig = gatheringConfig) {
  return (speed ?? 0) > config.animalFleeSpeed;
}

function resourceOf(spawn: Spawn, resources: ResourceDef[]) {
  const resource = resources.find((r) => r.id === spawn.resourceId);
  if (!resource) throw new Error(`Unknown resource ${spawn.resourceId}`);
  return resource;
}

/** Materials from a spawn; `bonus` is added to each yield of a gathering node. */
export function spawnYield(spawn: Spawn, resources: ResourceDef[] = defaultResources, bonus = 0) {
  const extra = spawn.kind === 'ore' ? bonus : 0;
  return resourceOf(spawn, resources).yields.map((y) => ({
    materialId: y.materialId,
    amount: y.amount * spawn.quantity + extra,
  }));
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
  if (distance > config.collectRadiusMeters) return { ok: false, reason: 'tooFar', distance };
  if (spawn.kind === 'animal' && isFleeing(gatherer.speed, config)) {
    return { ok: false, reason: 'fled', distance };
  }
  const resource = resourceOf(spawn, resources);
  if (!canGather(save, resource)) {
    return { ok: false, reason: 'needsPickaxe', distance, requiredPickaxe: resource.requiresPickaxe };
  }

  const gained = spawnYield(spawn, resources, bestPickaxe(save)?.yieldBonus ?? 0);
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
