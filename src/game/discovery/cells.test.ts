import ngeohash from 'ngeohash';

import { supplyRules } from '@/content/supplyLines';

import { offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import { addCells, allCells, cellAt, cellCount, cellPeriod, cellsAlong, isScouted } from './cells';

const origin = { latitude: -41.2865, longitude: 174.7762 };

describe('cellsAlong', () => {
  it('crosses a kilometre with no gaps: consecutive cells are equal or neighbours, and both ends are kept', () => {
    const to = offsetPosition(origin, 1000, 0);
    const cells = cellsAlong(origin, to);
    expect(cells[0]).toBe(cellAt(origin));
    expect(cells[cells.length - 1]).toBe(cellAt(to));
    expect(cells.length).toBeGreaterThan(5);
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i] === cells[i - 1] || ngeohash.neighbors(cells[i - 1]).includes(cells[i])).toBe(true);
    }
  });

  it('gives the one cell for a segment of no length', () => {
    expect(cellsAlong(origin, origin)).toEqual([cellAt(origin)]);
  });
});

describe('addCells', () => {
  const a = cellAt(origin);
  const b = cellAt(offsetPosition(origin, 200, 0));

  it('adds cells and reports their period', () => {
    const set = addCells({}, [a, b], 3);
    expect(isScouted(set, a)).toBe(true);
    expect(cellPeriod(set, a)).toBe(3);
    expect(cellCount(set)).toBe(2);
    expect(allCells(set).sort()).toEqual([a, b].sort());
  });

  it('returns the same object when nothing changes', () => {
    const set = addCells({}, [a], 3);
    expect(addCells(set, [a], 3)).toBe(set);
    expect(addCells(set, [], 4)).toBe(set);
  });

  it('moves a cell to the new period and drops the empty entry', () => {
    const added = addCells({}, [a], 3);
    const moved = addCells(added, [a], 4);
    expect(moved).not.toBe(added);
    expect(cellPeriod(moved, a)).toBe(4);
    expect(moved[a.slice(0, supplyRules.cellPrecision - 2)]).toEqual({ 4: a.slice(-2) });
    expect(cellCount(moved)).toBe(1);
  });

  it('keeps 3,000 random cells under 10 KB serialised', () => {
    const rng = createRng('cells-size');
    const cells = Array.from({ length: 3000 }, () =>
      cellAt({ latitude: -41.35 + rng.next() * 0.2, longitude: 174.65 + rng.next() * 0.4 }),
    );
    const set = addCells({}, cells, 5);
    expect(cellCount(set)).toBe(new Set(cells).size);
    expect(JSON.stringify(set).length).toBeLessThan(10 * 1024);
  });
});
