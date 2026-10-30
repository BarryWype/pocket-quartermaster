import { lureRules } from '@/content/gatheringConfig';
import { resources } from '@/content/resources';

import { createRng } from '../generation/rng';
import { animalSpawns, pointAround } from '../gathering/walkEffects';
import type { LatLng, Spawn, StaticSpawn } from '../generation/types';
import type { SaveData } from '../save';
import type { ActiveLure } from '../types';

const DURATION_MS = lureRules.durationMinutes * 60_000;

export function lureEndsAt(save: SaveData) {
  return save.activeLure ? save.activeLure.activatedAt + DURATION_MS : 0;
}

export function isLureActive(save: SaveData, now: number) {
  return lureEndsAt(save) > now;
}

/** Uses a lure from the stock where the player stands. Only one runs at a time. */
export function activateLure(save: SaveData, position: LatLng, now: number): SaveData {
  if (save.lures < 1) throw new Error('No lure left');
  if (isLureActive(save, now)) throw new Error('A lure is already active');
  return {
    ...save,
    lures: save.lures - 1,
    activeLure: { id: `lure${save.nextUid}`, activatedAt: now, center: position },
    nextUid: save.nextUid + 1,
  };
}

/**
 * The private herbs and animals an active lure draws in, fixed by its id and
 * activation time. They vanish when the lure ends.
 */
export function lureSpawns(lure: ActiveLure | null, now: number): Spawn[] {
  if (!lure || lure.activatedAt + DURATION_MS <= now) return [];
  const rng = createRng(`${lure.id}|${lure.activatedAt}`);
  const expiresAt = lure.activatedAt + DURATION_MS;
  const ofKind = (kind: string) => resources.filter((r) => r.kind === kind);

  const herbs = Array.from({ length: lureRules.herbs }, (_, i): StaticSpawn => ({
    id: `${lure.id}:herb${i}`,
    kind: 'herb',
    resourceId: rng.weighted(ofKind('herb'), (r) => r.weight).id,
    tile: lure.id,
    quantity: rng.int(1, 2),
    boosted: false,
    expiresAt,
    position: pointAround(lure.center, lureRules.radiusMeters, rng),
  }));
  const animals = animalSpawns(
    { id: lure.id, center: lure.center, start: lure.activatedAt, end: expiresAt, count: lureRules.animals, radius: lureRules.radiusMeters, seed: lure.id },
    resources,
  );
  return [...herbs, ...animals];
}
