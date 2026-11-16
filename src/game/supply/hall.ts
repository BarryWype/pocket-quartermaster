import { supplyRules } from '@/content/supplyLines';

import { addCells, cellsAlong } from '../discovery/cells';
import { distanceMeters } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import type { SaveData } from '../save';

export type HallProblem = 'tooSoon' | 'campsOutOfRange' | null;

const DAY_MS = 24 * 3_600_000;

/** Why the hall cannot move to a cell now, or null. */
export function hallProblem(save: SaveData, cell: string, now: number): HallProblem {
  const hall = save.supply.hall;
  if (hall && now - hall.movedAt < supplyRules.hall.moveEveryDays * DAY_MS) return 'tooSoon';
  const centre = tileCenter(cell);
  if (save.supply.camps.some((camp) => distanceMeters(tileCenter(camp.cell), centre) > supplyRules.camps.maxHallMeters)) {
    return 'campsOutOfRange';
  }
  return null;
}

/**
 * Places or moves the hall. The first placement doesn't count, so a misplaced
 * hall can be moved at once; later moves store their time.
 */
export function placeHall(save: SaveData, cell: string, now: number): SaveData {
  const problem = hallProblem(save, cell, now);
  if (problem) throw new Error(`Cannot place the hall: ${problem}`);
  return { ...save, supply: { ...save.supply, hall: { cell, movedAt: save.supply.hall ? now : 0 } } };
}

/**
 * Scouts the cells a path crosses into the period's entry. Returns the same
 * save when the path adds nothing new.
 */
export function scoutPath(save: SaveData, points: LatLng[], period: number): SaveData {
  const cells = points.slice(1).flatMap((to, i) => cellsAlong(points[i], to));
  const scouted = addCells(save.supply.scouted, cells, period);
  if (scouted === save.supply.scouted) return save;
  return { ...save, supply: { ...save.supply, scouted } };
}
