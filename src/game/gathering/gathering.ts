import { gatheringConfig, type GatheringConfig } from '@/content/gatheringConfig';
import { itemById } from '@/content/lookup';
import { resources as defaultResources } from '@/content/resources';

import { spawnPositionAt } from '../generation/animalPaths';
import { distanceMeters } from '../generation/geo';
import type { LatLng, ResourceDef, Spawn } from '../generation/types';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { MaterialStack } from '../types';
import { readSpawn } from './lockedNodes';
import { walkEffectAt } from './walkEffects';
import { questEvent } from '../quests/progress';

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
 * Whether the player may gather a spawn: anything their pickaxe can handle,
 * including locked ore nodes that read as a minable ore for them (see lockedNodes.ts).
 */
export function canGather(save: SaveData, spawn: Spawn, resources: ResourceDef[] = defaultResources) {
  return readSpawn(save, spawn, resources).state !== 'locked';
}

/**
 * Whether a spawn shows on the map: everything gatherable, plus locked ore
 * nodes, which show greyed out with the pickaxe they need.
 */
export function showsOnMap(save: SaveData, spawn: Spawn) {
  return true;
}

export function isFleeing(speed: number | null, config: GatheringConfig = gatheringConfig) {
  return (speed ?? 0) > config.animalFleeSpeed;
}

export function spawnYield(spawn: Spawn, resources: ResourceDef[] = defaultResources, resourceId: string = spawn.resourceId) {
  const resource = resources.find((r) => r.id === resourceId);
  if (!resource) throw new Error(`Unknown resource ${resourceId}`);
  return resource.yields.map((y) => ({ materialId: y.materialId, amount: y.amount * spawn.quantity }));
}

/** Drops collected-spawn entries whose window has ended. */
export function pruneCollected(collected: Record<string, number>, timeMs: number) {
  return Object.fromEntries(Object.entries(collected).filter(([, expiresAt]) => expiresAt > timeMs));
}

/** The local calendar day of a moment, as an ISO date (the walking bonus resets with it). */
export const localDayKey = (timeMs: number) => {
  const date = new Date(timeMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** How many of today's bonus gathers are left. */
export function freshGathersLeft(save: SaveData, timeMs: number, config: GatheringConfig = gatheringConfig) {
  const day = localDayKey(timeMs);
  const used = save.freshGathers.day === day ? save.freshGathers.used : 0;
  return Math.max(0, config.walkingBonus.gathers - used);
}

/**
 * The walking bonus for one gather: the day's first `gathers` collects yield
 * `multiplier`, rounded up per material. Returns the spend to record, or null
 * when the bonus is out.
 */
export function bonusForGather(save: SaveData, spawn: Spawn, timeMs: number, config: GatheringConfig = gatheringConfig) {
  if (freshGathersLeft(save, timeMs, config) <= 0) return null;
  return { day: localDayKey(timeMs), used: (save.freshGathers.day === localDayKey(timeMs) ? save.freshGathers.used : 0) + 1 };
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
  // Locked ore nodes read as the ore the player can mine (converted), or are refused.
  const read = readSpawn(save, spawn, resources);
  if (read.state === 'locked') return { ok: false, reason: 'needsTool', distance };
  if (distance > config.collectRadiusMeters) return { ok: false, reason: 'tooFar', distance };
  if (spawn.kind === 'animal' && isFleeing(gatherer.speed, config)) {
    return { ok: false, reason: 'fled', distance };
  }

  const gained = spawnYield(spawn, resources, read.resourceId);
  const bonus = bonusForGather(save, spawn, timeMs, config);
  const withWalkingBonus: MaterialStack[] = bonus
    ? gained.map((stack) => ({ materialId: stack.materialId, amount: Math.ceil(stack.amount * config.walkingBonus.multiplier) }))
    : gained;
  // The prospector's draught: one more per ore, on top of any walking bonus.
  const oreBonus =
    spawn.kind === 'ore' && walkEffectAt(save.walkEffects, 'prospect', timeMs) ? config.walkEffects.prospect.oreBonus : 0;
  const finalGained = oreBonus
    ? withWalkingBonus.map((stack) => ({ materialId: stack.materialId, amount: stack.amount + oreBonus }))
    : withWalkingBonus;
  const collected: SaveData = {
    ...save,
    materials: addMaterials(save.materials, finalGained),
    collected: { ...pruneCollected(save.collected, timeMs), [spawn.id]: spawn.expiresAt },
    ...(bonus ? { freshGathers: bonus } : {}),
  };
  return {
    ok: true,
    gained: finalGained,
    save: finalGained.reduce((next, { materialId, amount }) => questEvent(next, { kind: 'gathered', materialId, amount }, timeMs), collected),
  };
}
