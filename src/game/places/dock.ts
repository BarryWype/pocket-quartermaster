import { placeRules } from '@/content/places';

import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import { rollForSave } from '../loot/context';
import { grantLoot } from '../loot/grant';
import type { Loot } from '../loot/types';
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
 * Fishes at a dock: its row of the loot matrix (fish, rarely a sunken find).
 * One catch per dock per player, so the place hides for its window once fished.
 */
export function fish(save: SaveData, spawn: PlaceSpawn, player: LatLng, now: number): { save: SaveData; loot: Loot } {
  const problem = fishProblem(save, spawn, player, now);
  if (problem) throw new Error(`Cannot fish here: ${problem}`);
  const loot = rollForSave(save, 'fishingDock', createRng(`fish|${spawn.id}`));
  const granted = grantLoot(save, [], loot, now);
  return { save: { ...granted, usedPlaces: { ...granted.usedPlaces, [spawn.id]: spawn.expiresAt } }, loot };
}
