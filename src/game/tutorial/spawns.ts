import { gatheringConfig } from '@/content/gatheringConfig';
import { tutorialRules } from '@/content/tutorial';
import { walkableRules } from '@/content/walkable';

import { addMaterials } from '../inventory';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { snapToWalkable, type WalkableTile } from '../generation/walkable';
import type { SaveData, TutorialSpawn } from '../save';
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

/** One random spot at tutorial distance from the player. */
const randomSpot = (rng: ReturnType<typeof createRng>, player: LatLng) => {
  const angle = rng.next() * 2 * Math.PI;
  const [min, max] = tutorialRules.spawnMeters;
  const meters = min + rng.next() * (max - min);
  return offsetPosition(player, Math.cos(angle) * meters, Math.sin(angle) * meters);
};

/**
 * Spawns the current step's nodes around the player, once per step: each on a
 * walkable spot when the tile is in, at most `spawnMeters` away and apart from
 * its neighbours. Without a tile (or a player) the spots go out unsnapped —
 * or without position at all, reached only through "Collect from here".
 */
export function placeTutorialSpawns(
  save: SaveData,
  player: LatLng | null,
  tile: WalkableTile | null | undefined,
  now: number,
): SaveData {
  const step = save.tutorial.step;
  const materials = tutorialRules.spawns[step];
  if (!materials || save.tutorial.spawns.some((s) => s.id.startsWith(`tutorial:${step}:`))) return save;
  if (player && tile === undefined) return save;

  const placed: LatLng[] = [];
  const rng = createRng(`tutorial|${step}|${now}`);
  const spawns = materials.map((materialId, i): TutorialSpawn => {
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
  return { ...save, tutorial: { ...save.tutorial, spawns: [...save.tutorial.spawns, ...spawns] } };
}

export type TutorialCollectResult =
  | { ok: true; save: SaveData; materialId: string }
  | { ok: false; reason: 'tooFar' | 'collected'; distance: number };

/**
 * Picks up one of the current step's nodes: the player must stand within the
 * gathering radius unless `anywhere` (the "Collect from here" fallback). Adds
 * the node's material, then moves the tutorial on.
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
  if (!anywhere && distance > gatheringConfig.collectRadiusMeters) return { ok: false, reason: 'tooFar', distance };

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
