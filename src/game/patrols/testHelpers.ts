import { createInitialSave, type SaveData } from '../save';
import { expectedLevels } from '../sim/config';
import { equip } from '../team/team';
import type { LatLng } from '../generation/types';
import { patrolPositionAt, patrolsAround, type PatrolSpawn } from './generate';

export const HOME: LatLng = { latitude: -41.2865, longitude: 174.7762 };
export const T0 = Date.UTC(2026, 9, 20, 9);

/** The starting heroes at the tier's expected level, in its Normal weapons and mail, with the tutorial done. */
export function tierTeam(tier = 1): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { step: 'done', woodSpot: null },
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: expectedLevels[tier - 1] })),
    gear: ['sword', 'bow', 'wand', 'mail', 'mail', 'mail'].map((type, i) => ({ uid: `g${i}`, itemId: `${type}${tier}`, quality: 'normal' as const })),
  };
  ['bram', 'lyra', 'mira'].forEach((heroId, i) => {
    save = equip(save, heroId, 'weapon', `g${i}`);
    save = equip(save, heroId, 'armor', `g${i + 3}`);
  });
  return save;
}

/** The first spawn around HOME, window after window from T0, that matches; with a time inside its window. */
export function findSpawn(matches: (spawn: PatrolSpawn) => boolean): { spawn: PatrolSpawn; at: number } {
  for (let w = 0; w < 500; w++) {
    const at = T0 + w * 30 * 60_000 + 60_000;
    const spawn = patrolsAround(HOME, at).find(matches);
    if (spawn) return { spawn, at };
  }
  throw new Error('No matching spawn');
}

/** A fix standing right on the spawn at a time. */
export const fixOn = (spawn: PatrolSpawn, at: number) => ({ position: patrolPositionAt(spawn, at), timestamp: at });
