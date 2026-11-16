import ngeohash from 'ngeohash';

import { cellAt, cellsAlong } from './cells';
import { offsetPosition } from '../generation/geo';

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
