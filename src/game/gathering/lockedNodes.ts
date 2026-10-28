import { resources as defaultResources } from '@/content/resources';

import type { ResourceDef, Spawn } from '../generation/types';
import type { SaveData } from '../save';
import { pickaxeTier } from './gathering';

/**
 * Locked ore nodes (the pickaxe can't mine them yet) read two ways, decided
 * deterministically by hashing the spawn id so the map is the same for every
 * player: half convert to an ore of a tier the player can mine, and half stay
 * visible but greyed out, showing there is a progression. Only how a node is
 * read depends on the player's pickaxes, so it can't change while they stand
 * next to it — only when they gain a pickaxe.
 */

/** A spawn id's hash, as a float in [0, 1). */
export function spawnHash(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  // Final avalanche: spawn ids often differ only in their last characters.
  hash = Math.imul(hash ^ (hash >>> 15), 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 2 ** 32;
}

export type SpawnRead =
  | { state: 'open'; resourceId: string }
  | { state: 'converted'; resourceId: string }
  | { state: 'locked'; resourceId: string };

/** Whether the player's pickaxe handles the resource as it stands. */
const minable = (resource: ResourceDef | undefined, tier: number) => (resource?.pickaxeTier ?? 0) <= tier;

/**
 * A converted node's ore: one of the player's minable ores, picked by the
 * spawn id's hash and weighted towards their highest tier (an iron node
 * becomes copper more often than stone for a copper-pickaxe player).
 */
function convertedOre(save: SaveData, spawn: Spawn, resources: ResourceDef[]): string | null {
  const tier = pickaxeTier(save);
  if (tier < 1) return null;
  const candidates = resources.filter((r) => r.kind === 'ore' && r.pickaxeTier !== undefined && r.pickaxeTier >= 1 && r.pickaxeTier <= tier);
  if (!candidates.length) return null;
  // Weight each ore by its own tier, so the highest minable tier is the most likely.
  const total = candidates.reduce((sum, r) => sum + (r.pickaxeTier ?? 0), 0);
  let roll = spawnHash(`${spawn.id}|as`) * total;
  for (const ore of candidates) {
    roll -= ore.pickaxeTier ?? 0;
    if (roll < 0) return ore.id;
  }
  return candidates[candidates.length - 1].id;
}

/** How a spawn reads for this player: gatherable, converted to a minable ore, or locked. */
export function readSpawn(save: SaveData, spawn: Spawn, resources: ResourceDef[] = defaultResources): SpawnRead {
  const resource = resources.find((r) => r.id === spawn.resourceId);
  if (minable(resource, pickaxeTier(save))) return { state: 'open', resourceId: spawn.resourceId };
  const converted = spawnHash(spawn.id) < 0.5 ? convertedOre(save, spawn, resources) : null;
  return converted ? { state: 'converted', resourceId: converted } : { state: 'locked', resourceId: spawn.resourceId };
}

/** The pickaxe tier a spawn's own resource needs, or null when it needs none. */
export const requiredPickaxeTier = (spawn: Spawn, resources: ResourceDef[] = defaultResources) =>
  resources.find((r) => r.id === spawn.resourceId)?.pickaxeTier ?? null;
