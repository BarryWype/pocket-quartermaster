import { placeRules } from '@/content/places';
import { dockRules } from '@/content/placeActivities';

import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { PlaceSpawn } from './generate';
import type { SaveData } from '../save';
import type { LatLng } from '../generation/types';

export type FishProblem = 'gone' | 'tooFar';

/** Why this dock cannot be fished from here now, or null. Docks only show near water (see dockRules.waterMeters). */
export function fishProblem(save: SaveData, spawn: PlaceSpawn, player: LatLng, now: number): FishProblem | null {
  if (spawn.kind !== 'fishingDock' || spawn.startsAt > now || spawn.expiresAt <= now || spawn.id in save.usedPlaces) {
    return 'gone';
  }
  if (distanceMeters(player, spawn.position) > placeRules.interactionMeters) return 'tooFar';
  return null;
}

/**
 * Catches fish at a dock: one catch per dock per player, so the place hides
 * for its window once fished.
 */
export function fish(save: SaveData, spawn: PlaceSpawn, player: LatLng, now: number): { save: SaveData; amount: number } {
  const problem = fishProblem(save, spawn, player, now);
  if (problem) throw new Error(`Cannot fish here: ${problem}`);
  const amount = createRng(`fish|${spawn.id}`).int(...dockRules.fish);
  return {
    save: {
      ...save,
      materials: { ...save.materials, fish: (save.materials.fish ?? 0) + amount },
      usedPlaces: { ...save.usedPlaces, [spawn.id]: spawn.expiresAt },
    },
    amount,
  };
}
