import { supplyRules } from '@/content/supplyLines';

import { distanceMeters } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import type { SaveData } from '../save';
import { buildingReach } from './buildings';
import type { Building } from './types';

const WEEK_MS = 7 * 24 * 3_600_000;

/** The hall's moves still inside the 7-day window at `now`. */
const recentMoves = (save: SaveData, now: number): number[] =>
  (save.supply.hall?.moves ?? []).filter((at) => now - at < WEEK_MS);

/** Moves of the hall left this week: the weekly allowance minus the moves of the last 7 days. */
export function hallMovesLeft(save: SaveData, now: number): number {
  return supplyRules.hall.movesPerWeek - recentMoves(save, now).length;
}

/** When the oldest move inside the window leaves it (a move frees again 7 days after it was made), or null. */
export function hallMoveBackAt(save: SaveData, now: number): number | null {
  const moves = recentMoves(save, now);
  return moves.length > 0 ? moves[0] + WEEK_MS : null;
}

export type HallProblem = 'noMovesLeft' | null;

/** Why the hall cannot move to a cell now, or null. A first placement never has a problem. */
export function hallProblem(save: SaveData, cell: string, now: number): HallProblem {
  if (!save.supply.hall) return null;
  if (save.supply.hall.cell === cell) return null;
  return hallMovesLeft(save, now) <= 0 ? 'noMovesLeft' : null;
}

/** The buildings that would stand farther than the tier's reach from that cell's centre: a warning, not a refusal. */
export function buildingsOutOfReach(save: SaveData, cell: string): Building[] {
  const centre = tileCenter(cell);
  return save.supply.buildings.filter((building) => distanceMeters(building.position, centre) > buildingReach(save).meters);
}

/**
 * Places or moves the hall. The first placement doesn't count as a move, so a
 * misplaced hall can be moved at once; later moves keep the last 7 days' times
 * and append this one.
 */
export function placeHall(save: SaveData, cell: string, now: number): SaveData {
  const problem = hallProblem(save, cell, now);
  if (problem) throw new Error(`Cannot place the hall: ${problem}`);
  const hall = save.supply.hall;
  return { ...save, supply: { ...save.supply, hall: hall ? { cell, moves: [...recentMoves(save, now), now] } : { cell, moves: [] } } };
}
