/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

import ngeohash from 'ngeohash';

import { supplyRules } from '@/content/supplyLines';

import { tileCenter } from '../generation/tiles';
import { decodeWalkableTile, type WalkableTile } from '../generation/walkable';
import { cellTerrain, cellTileKeys } from './terrain';

// Wellington waterfront, the same fixture as walkable.test.ts.
const FIXTURE = { z: 14, x: 16147, y: 10258 };
const KEY = `${FIXTURE.z}/${FIXTURE.x}/${FIXTURE.y}`;
const fixture: WalkableTile = decodeWalkableTile(
  readFileSync(join(__dirname, '../generation/fixtures', 'wellington-14-16147-10258.pbf')),
  FIXTURE,
);

/** The fixture tile's own bounds, to take the cells whose centre lies inside it. */
const bounds = (() => {
  const n = 2 ** FIXTURE.z;
  return {
    minLat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * (FIXTURE.y + 1)) / n))) * 180) / Math.PI,
    maxLat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * FIXTURE.y) / n))) * 180) / Math.PI,
    minLon: (FIXTURE.x / n) * 360 - 180,
    maxLon: ((FIXTURE.x + 1) / n) * 360 - 180,
  };
})();

/** Every precision-7 cell whose centre lies inside the fixture tile and needs only that tile. */
const cells = ngeohash
  .bboxes(bounds.minLat, bounds.minLon, bounds.maxLat, bounds.maxLon, supplyRules.cellPrecision)
  .filter((cell) => {
    const centre = tileCenter(cell);
    return (
      centre.latitude >= bounds.minLat &&
      centre.latitude <= bounds.maxLat &&
      centre.longitude >= bounds.minLon &&
      centre.longitude <= bounds.maxLon &&
      cellTileKeys(cell).length === 1 &&
      cellTileKeys(cell)[0] === KEY
    );
  });

const classified = cells.map((cell) => cellTerrain(cell, { [KEY]: fixture }));

describe('cellTerrain', () => {
  it('waits while a needed tile is missing and stays unknown when one failed', () => {
    const cell = cells.find((c) => classified[cells.indexOf(c)] !== undefined)!;
    expect(cellTerrain(cell, {})).toBeUndefined();
    expect(cellTerrain(cell, { [KEY]: null })).toBeUndefined();
  });

  it('classifies the fixture tile about as measured: mostly harbour, some green, waterside and built', () => {
    expect(cells.length).toBeGreaterThan(150);
    const count = (of: string) => classified.filter((t) => t === of).length;
    expect(count('water')).toBeGreaterThanOrEqual(120);
    expect(count('water')).toBeLessThanOrEqual(160);
    expect(count('green')).toBeGreaterThanOrEqual(5);
    expect(count('green')).toBeLessThanOrEqual(20);
    expect(count('waterside')).toBeGreaterThanOrEqual(15);
    expect(count('waterside')).toBeLessThanOrEqual(45);
    expect(count('built')).toBeGreaterThanOrEqual(5);
    expect(count('built')).toBeLessThanOrEqual(25);
  });

  it('classifies every cell of the tile in under 500 ms', () => {
    const started = Date.now();
    for (const cell of cells) cellTerrain(cell, { [KEY]: fixture });
    expect(Date.now() - started).toBeLessThan(500);
  });
});
