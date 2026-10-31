import { gatheringConfig } from '@/content/gatheringConfig';
import { tutorialRules } from '@/content/tutorial';
import { walkableRules } from '@/content/walkable';

import { addMaterials } from '../inventory';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { snapToWalkable, type WalkableTile } from '../generation/walkable';
import type { SaveData, TutorialSpawn } from '../save';
import type { MaterialStack } from '../types';
import { advanceTutorial } from './tutorial';

/** The current step's nodes, each still to pick up. */
const stepSpawns = (save: SaveData): TutorialSpawn[] => {
  const prefix = `tutorial:${save.tutorial.step}:`;
  return save.tutorial.spawns.filter((spawn) => spawn.id.startsWith(prefix) && !spawn.collected);
};

/** The tutorial nodes the map should show now: the current step's, uncollected. */
export function shownTutorialSpawns(save: SaveData): TutorialSpawn[] {
  return stepSpawns(save);
}

/**
 * The pick-up range that applies now: wider while the tutorial runs, so GPS
 * drift can't leave its nodes out of reach; back to the normal radius after.
 */
export function collectRadiusNow(save: SaveData): number {
  return save.tutorial.step === 'done' ? gatheringConfig.collectRadiusMeters : tutorialRules.collectRadiusMeters;
}

/** One random spot at tutorial distance from the player. */
const randomSpot = (rng: ReturnType<typeof createRng>, player: LatLng) => {
  const angle = rng.next() * 2 * Math.PI;
  const [min, max] = tutorialRules.spawnMeters;
  const meters = min + rng.next() * (max - min);
  return offsetPosition(player, Math.cos(angle) * meters, Math.sin(angle) * meters);
};

/**
 * Places one step's nodes around the player: each on a walkable spot when the
 * tile is in, within `spawnMeters`, and apart from its neighbours. Without a
 * player the nodes get no position — only "Collect from here" reaches them.
 */
const spawnStepNodes = (step: SaveData['tutorial']['step'], player: LatLng | null, tile: WalkableTile | null, now: number): TutorialSpawn[] => {
  const materials = tutorialRules.spawns[step];
  if (!materials) return [];
  const placed: LatLng[] = [];
  const rng = createRng(`tutorial|${step}|${now}`);
  return materials.map((materialId, i): TutorialSpawn => {
    const spawn = (position: LatLng | null): TutorialSpawn => {
      const node: TutorialSpawn = {
        id: `tutorial:${step}:${i}`,
        materialId,
        position,
        spawnedAt: now,
        collected: false,
      };
      if (position) placed.push(position);
      return node;
    };
    if (!player) return spawn(null);

    const spaced = (point: LatLng) => placed.every((p) => distanceMeters(p, point) >= tutorialRules.spacingMeters);
    let fallback: LatLng | null = null;
    for (let t = 0; t < tutorialRules.spawnTries; t++) {
      const spot = randomSpot(rng, player);
      const candidate = tile ? snapToWalkable(tile, spot, walkableRules.maxSnapMeters) : spot;
      if (!candidate) continue;
      const distance = distanceMeters(player, candidate);
      if (distance < tutorialRules.spawnMeters[0] || distance > tutorialRules.spawnMeters[1]) continue;
      if (spaced(candidate)) return spawn(candidate);
      if (!fallback) fallback = candidate;
    }
    // Nothing walkable panned out: an unsnapped spot still respects distance, spacing where it can.
    for (let t = 0; t < tutorialRules.spawnTries; t++) {
      const spot = randomSpot(rng, player);
      if (spaced(spot)) return spawn(spot);
      fallback = spot;
    }
    return spawn(fallback);
  });
};

/**
 * Spawns the current step's nodes around the player, once per step: each on a
 * walkable spot when the tile is in, at most `spawnMeters` away and apart from
 * its neighbours. Without a tile (or a player) the spots go out unsnapped —
 * or without position at all, reached only through "Collect from here".
 *
 * When the player has drifted more than `respawnMeters` from the step's
 * remaining nodes (GPS wandered off), they respawn around the player's
 * current position instead.
 */
export function placeTutorialSpawns(
  save: SaveData,
  player: LatLng | null,
  tile: WalkableTile | null | undefined,
  now: number,
): SaveData {
  const step = save.tutorial.step;
  const materials = tutorialRules.spawns[step];
  if (!materials) return save;
  if (player && tile === undefined) return save;

  const prefix = `tutorial:${step}:`;
  const existing = save.tutorial.spawns.filter((s) => s.id.startsWith(prefix));
  if (existing.length > 0) {
    if (!player) return save;
    const remaining = existing.filter((s) => !s.collected);
    const outOfReach = remaining.length > 0 && remaining.every((s) => !s.position || distanceMeters(player, s.position) > tutorialRules.respawnMeters);
    if (!outOfReach) return save;
    // Respawn the step's nodes around where the player stands now (picked-up ones stay gathered).
    const fresh = spawnStepNodes(step, player, tile ?? null, now);
    return { ...save, tutorial: { ...save.tutorial, spawns: [...save.tutorial.spawns.filter((s) => !s.id.startsWith(prefix)), ...fresh] } };
  }
  return { ...save, tutorial: { ...save.tutorial, spawns: [...save.tutorial.spawns, ...spawnStepNodes(step, player, tile ?? null, now)] } };
}

export type TutorialCollectResult =
  | { ok: true; save: SaveData; materialId: string }
  | { ok: false; reason: 'tooFar' | 'collected'; distance: number };

export type TutorialCollectAllResult =
  | { ok: true; save: SaveData; gained: MaterialStack[] }
  | { ok: false; reason: 'collected'; distance: number };

/**
 * Whether the "Collect from here" fallback button shows: the current step has
 * a node to pick up and nothing was, for `fallbackSeconds`, since the last
 * spawn or pickup — or the player has no location at all.
 */
export function fallbackReady(save: SaveData, now: number, locationOff: boolean): boolean {
  const spawns = stepSpawns(save);
  if (spawns.length === 0) return false;
  if (locationOff) return true;
  const since = Math.max(save.tutorial.lastPickupAt ?? 0, ...spawns.map((s) => s.spawnedAt));
  return now - since >= tutorialRules.fallbackSeconds * 1000;
}

/** The fallback: picks up every remaining node of the current step at once, wherever the player is. */
export function collectFromHere(save: SaveData, now: number): TutorialCollectAllResult {
  let next = save;
  const gained: MaterialStack[] = [];
  for (const spawn of stepSpawns(save)) {
    const result = collectTutorialSpawn(next, spawn.id, null, now, { anywhere: true });
    if (!result.ok) continue;
    next = result.save;
    gained.push({ materialId: result.materialId, amount: 1 });
  }
  if (gained.length === 0) return { ok: false, reason: 'collected', distance: Infinity };
  return { ok: true, save: next, gained };
}

/**
 * Picks up one of the current step's nodes: the player must stand within the
 * pick-up range (wider during the tutorial) unless `anywhere` (the "Collect
 * from here" fallback). Adds the node's material, then moves the tutorial on.
 */
export function collectTutorialSpawn(
  save: SaveData,
  id: string,
  player: LatLng | null,
  now: number,
  { anywhere = false } = {},
): TutorialCollectResult {
  const spawn = stepSpawns(save).find((s) => s.id === id);
  if (!spawn) return { ok: false, reason: 'collected', distance: Infinity };
  const distance = player && spawn.position ? distanceMeters(player, spawn.position) : Infinity;
  if (!anywhere && distance > collectRadiusNow(save)) return { ok: false, reason: 'tooFar', distance };

  const picked: SaveData = {
    ...save,
    materials: addMaterials(save.materials, [{ materialId: spawn.materialId, amount: 1 }]),
    tutorial: {
      ...save.tutorial,
      spawns: save.tutorial.spawns.map((s) => (s.id === id ? { ...s, collected: true } : s)),
      lastPickupAt: now,
    },
  };
  return { ok: true, save: advanceTutorial(picked), materialId: spawn.materialId };
}
