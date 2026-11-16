import { supplyRules } from '@/content/supplyLines';

import { distanceMeters } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import { hasMaterials, removeMaterials } from '../inventory';
import type { SaveData } from '../save';
import { settleCamps } from './production';
import type { Camp, Terrain } from './types';

export type CampProblem =
  | 'noHall'
  | 'notHere'
  | 'unknownTerrain'
  | 'water'
  | 'notGreen'
  | 'occupied'
  | 'full'
  | 'tooFar'
  | 'cost'
  | null;

/** Why a camp of this kind cannot be founded in a cell now, or null. */
export function campProblem(
  save: SaveData,
  kind: Camp['kind'],
  cell: string,
  terrain: Terrain | 'water' | undefined,
  playerCell: string,
  now: number,
): CampProblem {
  const supply = save.supply;
  if (!supply.hall) return 'noHall';
  if (playerCell !== cell) return 'notHere';
  if (terrain === undefined) return 'unknownTerrain';
  if (terrain === 'water') return 'water';
  if (kind === 'timber' && terrain !== 'green') return 'notGreen';
  if (supply.camps.some((camp) => camp.cell === cell)) return 'occupied';
  if (supply.camps.length + supply.slotsFreeAt.filter((t) => t > now).length >= supplyRules.camps.max) return 'full';
  if (distanceMeters(tileCenter(cell), tileCenter(supply.hall.cell)) > supplyRules.camps.maxHallMeters) return 'tooFar';
  const { gold, materials } = supplyRules.camps.foundCost;
  if (save.gold < gold || !hasMaterials(save.materials, materials)) return 'cost';
  return null;
}

/**
 * Founds a camp, paying its cost. `free` (debug) skips only the standing and
 * cost checks; every other rule still applies.
 */
export function foundCamp(
  save: SaveData,
  kind: Camp['kind'],
  cell: string,
  terrain: Terrain | 'water' | undefined,
  playerCell: string,
  now: number,
  { free = false } = {},
): SaveData {
  // Free founding stands the player in the cell by decree and pays nothing.
  let problem = campProblem(save, kind, cell, terrain, free ? cell : playerCell, now);
  if (free && problem === 'cost') problem = null;
  if (problem) throw new Error(`Cannot found a camp: ${problem}`);

  const { gold, materials } = supplyRules.camps.foundCost;
  const camp: Camp = {
    id: `c${save.supply.nextId}`,
    kind,
    cell,
    terrain: terrain as Terrain,
    foundedAt: now,
    heroId: null,
    postedAt: null,
    stock: {},
    progress: 0,
    made: 0,
    settledAt: now,
    inspectedUntil: 0,
    closedUntil: 0,
  };
  return {
    ...save,
    ...(free ? {} : { gold: save.gold - gold, materials: removeMaterials(save.materials, materials) }),
    supply: { ...save.supply, camps: [...save.supply.camps, camp], nextId: save.supply.nextId + 1 },
  };
}

/**
 * Packs a camp up: its stock is lost, and its slot frees again after the
 * cooldown. Settling first accrues a posted hero's trade hours; a posted hero
 * is simply free again. Expired slots are pruned on the way.
 */
export function packUpCamp(save: SaveData, campId: string, now: number, periodOffset = 0): SaveData {
  if (!save.supply.camps.some((camp) => camp.id === campId)) throw new Error(`Unknown camp ${campId}`);
  const settled = settleCamps(save, now, periodOffset);
  const slotsFreeAt = [
    ...settled.supply.slotsFreeAt.filter((t) => t > now),
    now + supplyRules.camps.packUpCooldownHours * 3_600_000,
  ];
  return {
    ...settled,
    supply: { ...settled.supply, camps: settled.supply.camps.filter((camp) => camp.id !== campId), slotsFreeAt },
  };
}
