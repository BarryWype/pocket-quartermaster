import { createRng } from './rng';
import { randomPointInTile, tileAt, tileBounds, tilesAround } from './tiles';

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
