import { createRng } from './rng';
import { randomPointInTile, tileAreaKm2, tileAt, tileBounds, tilesAround, tilesWithin } from './tiles';

const wellington = { latitude: -41.2865, longitude: 174.7762 };

describe('tiles', () => {
  it('encodes a position into a tile of the given precision', () => {
    expect(tileAt(wellington, 6)).toHaveLength(6);
    expect(tileAt(wellington, 7).startsWith(tileAt(wellington, 6))).toBe(true);
  });

  it('returns the current tile and its 8 unique neighbours', () => {
    const tiles = tilesAround(wellington, 7);
    expect(tiles).toHaveLength(9);
    expect(new Set(tiles).size).toBe(9);
    expect(tiles[0]).toBe(tileAt(wellington, 7));
  });

  it('measures a tile area that shrinks with latitude', () => {
    const equator = tileAreaKm2(tileAt({ latitude: 0.01, longitude: 48.5 }, 5));
    expect(equator).toBeGreaterThan(4 * 4);
    expect(equator).toBeLessThan(5 * 5);
    const oslo = tileAreaKm2(tileAt({ latitude: 59.9, longitude: 10.7 }, 5));
    expect(oslo).toBeGreaterThan(equator * 0.45);
    expect(oslo).toBeLessThan(equator * 0.6);
  });

  it('covers the tiles within a metre radius of a position', () => {
    const tiles = tilesWithin(wellington, 3000, 6);
    expect(tiles.length).toBeGreaterThan(1);
    expect(new Set(tiles).size).toBe(tiles.length);
    for (const corner of [
      { latitude: wellington.latitude + 0.02, longitude: wellington.longitude + 0.02 },
      { latitude: wellington.latitude - 0.02, longitude: wellington.longitude - 0.02 },
    ]) {
      expect(tiles).toContain(tileAt(corner, 6));
    }
    expect(tiles).toContain(tileAt(wellington, 6));
  });

  it('places random points inside the tile', () => {
    const tile = tileAt(wellington, 7);
    const bounds = tileBounds(tile);
    const rng = createRng('points');
    for (let i = 0; i < 50; i++) {
      const point = randomPointInTile(tile, rng);
      expect(point.latitude).toBeGreaterThanOrEqual(bounds.minLat);
      expect(point.latitude).toBeLessThanOrEqual(bounds.maxLat);
      expect(point.longitude).toBeGreaterThanOrEqual(bounds.minLon);
      expect(point.longitude).toBeLessThanOrEqual(bounds.maxLon);
      expect(tileAt(point, 7)).toBe(tile);
    }
  });
});
