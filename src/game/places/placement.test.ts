import { placePlacement, placedPosition } from './placement';
import { mapTileAt, mapTileKey, type WalkableTile } from '../generation/walkable';
import type { PlaceSpawn } from './generate';
import type { LatLng } from '../generation/types';

const origin: LatLng = { latitude: -41.2865, longitude: 174.7762 };

const spawn = (extra: Partial<PlaceSpawn> = {}): PlaceSpawn => ({
  id: 'place:x',
  kind: 'tavern',
  group: 'g',
  tile: 't',
  position: origin,
  startsAt: 0,
  expiresAt: 1,
  roll: 0,
  ...extra,
});

/** A tile whose one area holds the point: the point places as itself. */
const areaTile = (point: LatLng): WalkableTile => {
  const d = 0.001;
  const ring = [
    { latitude: point.latitude - d, longitude: point.longitude - d },
    { latitude: point.latitude - d, longitude: point.longitude + d },
    { latitude: point.latitude + d, longitude: point.longitude + d },
    { latitude: point.latitude + d, longitude: point.longitude - d },
  ];
  const bbox = { minLat: point.latitude - d, minLon: point.longitude - d, maxLat: point.latitude + d, maxLon: point.longitude + d };
  return { ways: [], areas: [{ rings: [ring], bbox }], water: [], green: [] };
};

const tilesOf = (point: LatLng, tile: WalkableTile | null): Record<string, WalkableTile | null> => ({
  [mapTileKey(mapTileAt(point, placePlacement.mapZoom))]: tile,
});

describe('placedPosition', () => {
  it('returns the raw position when the map tile is missing', () => {
    expect(placedPosition(spawn(), {})).toEqual(origin);
  });

  it('snaps onto the walkable ground when the tile is loaded', () => {
    const placed = placedPosition(spawn(), tilesOf(origin, areaTile(origin)));
    expect(placed).toEqual(origin);
  });

  it('drops a place that cannot place on its tile', () => {
    const empty: WalkableTile = { ways: [], areas: [], water: [], green: [] };
    expect(placedPosition(spawn(), tilesOf(origin, empty))).toBeNull();
  });

  it('drops a fishing dock with no water near, and keeps it on the water’s edge', () => {
    const dock = spawn({ kind: 'fishingDock' });
    expect(placedPosition(dock, tilesOf(origin, areaTile(origin)))).toBeNull();
    const wet = areaTile(origin);
    const d = 0.001;
    // A water edge about 150 m away: within the dock's waterMeters.
    wet.water = [
      {
        rings: [[{ latitude: origin.latitude + d, longitude: origin.longitude - d }, { latitude: origin.latitude + d, longitude: origin.longitude + d }]],
        bbox: { minLat: origin.latitude, minLon: origin.longitude - d, maxLat: origin.latitude + 2 * d, maxLon: origin.longitude + d },
      },
    ];
    expect(placedPosition(dock, tilesOf(origin, wet))).toEqual(origin);
  });
});
