import { supplyRules } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { emptySupply } from './state';
import type { Camp } from './types';
import { hallProblem, placeHall, scoutPath } from './hall';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const DAY_MS = 24 * 3_600_000;
const moveEveryMs = supplyRules.hall.moveEveryDays * DAY_MS;

const save = (): SaveData => ({ ...createInitialSave(), supply: emptySupply(now) });

const cellNear = (meters: number, bearing = 0) => cellAt(offsetPosition(origin, meters, bearing));

const campAt = (cell: string): Camp => ({
  id: 'c1',
  kind: 'trapper',
  cell,
  terrain: 'built',
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
  it('places the first hall with movedAt 0, so the first move is free', () => {
    const placed = placeHall(save(), cellNear(0), now);
    expect(placed.supply.hall).toEqual({ cell: cellNear(0), movedAt: 0 });
    expect(hallProblem(placed, cellNear(100), now + DAY_MS)).toBeNull();
    expect(placeHall(placed, cellNear(100), now + DAY_MS).supply.hall).toEqual({ cell: cellNear(100), movedAt: now + DAY_MS });
  });

  it('refuses a move too soon', () => {
    const placed = placeHall(placeHall(save(), cellNear(0), now), cellNear(100), now + DAY_MS);
    expect(hallProblem(placed, cellNear(200), now + 2 * DAY_MS)).toBe('tooSoon');
    expect(() => placeHall(placed, cellNear(200), now + 2 * DAY_MS)).toThrow();
    expect(hallProblem(placed, cellNear(200), placed.supply.hall!.movedAt + moveEveryMs)).toBeNull();
  });

  it('refuses a move that leaves a camp out of range', () => {
    const withCamp = { ...save(), supply: { ...emptySupply(now), hall: { cell: cellNear(0), movedAt: 0 }, camps: [campAt(cellAt(offsetPosition(origin, -1500, 0)))] } };
    expect(hallProblem(withCamp, cellNear(-500), now)).toBeNull();
    const far = cellAt(offsetPosition(origin, supplyRules.camps.maxHallMeters + 500, 0));
    expect(hallProblem(withCamp, far, now)).toBe('campsOutOfRange');
    expect(() => placeHall(withCamp, far, now)).toThrow();
  });
});

describe('scoutPath', () => {
  it('scouts the cells along the path into the period, and changes nothing the second time', () => {
    const points = [origin, offsetPosition(origin, 300, 0), offsetPosition(origin, 300, 90)];
    const walked = scoutPath(save(), points, 4);
    expect(Object.keys(walked.supply.scouted).length).toBeGreaterThan(0);
    expect(scoutPath(walked, points, 4)).toBe(walked);
    const again = scoutPath(walked, points, 5);
    expect(again).not.toBe(walked);
    expect(JSON.stringify(again.supply.scouted)).not.toBe(JSON.stringify(walked.supply.scouted));
  });

  it('scouts nothing for a path of one point', () => {
    expect(scoutPath(save(), [origin], 4).supply.scouted).toEqual({});
  });
});
