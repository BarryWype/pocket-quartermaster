import { supplyRules } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { emptySupply } from './state';
import type { Camp } from './types';
import { campsOutOfReach, hallMoveBackAt, hallMovesLeft, hallProblem, placeHall } from './hall';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const DAY_MS = 24 * 3_600_000;
const WEEK_MS = 7 * DAY_MS;

const save = (): SaveData => ({ ...createInitialSave(), supply: emptySupply(now) });

const cellNear = (meters: number, bearing = 0) => cellAt(offsetPosition(origin, meters, bearing));

const campAt = (cell: string): Camp => ({
  id: 'c1',
  kind: 'trapper',
  cell,
  quality: 2,
  foundedAt: now,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
});

describe('placeHall', () => {
  it('places the first hall with no moves, so the first move is free', () => {
    const placed = placeHall(save(), cellNear(0), now);
    expect(placed.supply.hall).toEqual({ cell: cellNear(0), moves: [] });
    expect(hallProblem(placed, cellNear(100), now + DAY_MS)).toBeNull();
    expect(placeHall(placed, cellNear(100), now + DAY_MS).supply.hall).toEqual({ cell: cellNear(100), moves: [now + DAY_MS] });
  });

  it('allows movesPerWeek moves in any 7 days, then refuses until the oldest leaves the window', () => {
    let moved = placeHall(placeHall(save(), cellNear(0), now), cellNear(100), now + DAY_MS);
    moved = placeHall(moved, cellNear(200), now + 2 * DAY_MS);
    expect(hallMovesLeft(moved, now + 2 * DAY_MS)).toBe(0);
    expect(hallProblem(moved, cellNear(300), now + 3 * DAY_MS)).toBe('noMovesLeft');
    expect(() => placeHall(moved, cellNear(300), now + 3 * DAY_MS)).toThrow();
    // The first move frees again 7 days after it was made.
    expect(hallMoveBackAt(moved, now + 3 * DAY_MS)).toBe(now + DAY_MS + WEEK_MS);
    expect(hallProblem(moved, cellNear(300), now + DAY_MS + WEEK_MS)).toBeNull();
    expect(placeHall(moved, cellNear(300), now + DAY_MS + WEEK_MS).supply.hall?.moves).toEqual([now + 2 * DAY_MS, now + DAY_MS + WEEK_MS]);
  });

  it('drops moves older than 7 days when placing again', () => {
    const times = [now - 8 * DAY_MS, now - 6 * DAY_MS];
    const aged: SaveData = { ...save(), supply: { ...emptySupply(now), hall: { cell: cellNear(0), moves: [...times] } } };
    expect(hallMovesLeft(aged, now)).toBe(supplyRules.hall.movesPerWeek - 1);
    const placed = placeHall(aged, cellNear(100), now);
    expect(placed.supply.hall?.moves).toEqual([now - 6 * DAY_MS, now]);
  });

  it('a first placement never has a problem, and no move leaves nothing to wait for', () => {
    expect(hallProblem(save(), cellNear(0), now)).toBeNull();
    expect(hallMovesLeft(save(), now)).toBe(supplyRules.hall.movesPerWeek);
    expect(hallMoveBackAt(save(), now)).toBeNull();
  });
});

describe('campsOutOfReach', () => {
  it('lists the camps farther than maxHallMeters from the cell, without refusing the move', () => {
    const withCamp = { ...save(), supply: { ...emptySupply(now), hall: { cell: cellNear(0), moves: [] }, camps: [campAt(cellAt(offsetPosition(origin, -1500, 0)))] } };
    expect(campsOutOfReach(withCamp, cellNear(-500))).toEqual([]);
    const far = cellAt(offsetPosition(origin, supplyRules.camps.maxHallMeters + 500, 0));
    expect(campsOutOfReach(withCamp, far).map((camp) => camp.id)).toEqual(['c1']);
    expect(hallProblem(withCamp, far, now)).toBeNull();
  });
});
