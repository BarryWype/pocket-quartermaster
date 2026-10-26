import { foliageCandidates, foliageToGeoJSON, placeFoliage, type Bounds, type FoliageObstacles } from './foliage';

// About 220 × 220 m in Wellington.
const bounds: Bounds = [174.775, -41.288, 174.7776, -41.286];
const none: FoliageObstacles = { blocked: [], lines: [], wooded: [] };

const box = ([west, south, east, north]: Bounds): GeoJSON.Feature => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  },
});

describe('foliage', () => {
  it('places the same plants in the same place every time', () => {
    expect(placeFoliage(bounds, none)).toEqual(placeFoliage(bounds, none));
  });

  it('keeps plants inside the bounds, with a few per grid cell on average', () => {
    const plants = placeFoliage(bounds, none);
    expect(plants.length).toBeGreaterThan(20);
    expect(plants.length).toBeLessThan(120);
    for (const { position } of plants) {
      expect(position.longitude).toBeGreaterThanOrEqual(bounds[0]);
      expect(position.latitude).toBeLessThanOrEqual(bounds[3]);
    }
  });

  it('gives a spot the same plant when the view moves', () => {
    const shifted: Bounds = [bounds[0] + 0.0005, bounds[1], bounds[2] + 0.0005, bounds[3]];
    const inBoth = (b: Bounds) => foliageCandidates(b).filter((c) => c.position.longitude > shifted[0] && c.position.longitude < bounds[2]);
    expect(inBoth(shifted)).toEqual(inBoth(bounds));
  });

  it('never grows in blocked areas such as water or buildings', () => {
    const west: Bounds = [bounds[0], bounds[1], (bounds[0] + bounds[2]) / 2, bounds[3]];
    const plants = placeFoliage(bounds, { ...none, blocked: [box(west)] });
    expect(plants.length).toBeGreaterThan(0);
    plants.forEach(({ position }) => expect(position.longitude).toBeGreaterThan(west[2]));
  });

  it('keeps clear of roads', () => {
    const latitude = (bounds[1] + bounds[3]) / 2;
    const road: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[bounds[0], latitude], [bounds[2], latitude]] },
    };
    const plants = placeFoliage(bounds, { ...none, lines: [{ feature: road, clearance: 10 }] });
    plants.forEach(({ position }) => expect(Math.abs(position.latitude - latitude) * 111_320).toBeGreaterThan(10));
  });

  it('grows denser in woods', () => {
    expect(placeFoliage(bounds, { ...none, wooded: [box(bounds)] }).length).toBeGreaterThan(
      placeFoliage(bounds, none).length * 1.4,
    );
  });

  it('grows mostly trees in woods and mostly bushes in the open', () => {
    const share = (obstacles: FoliageObstacles) => {
      const plants = placeFoliage(bounds, obstacles);
      return plants.filter((p) => p.kind === 'tree').length / plants.length;
    };
    expect(share(none)).toBeLessThan(0.4);
    expect(share({ ...none, wooded: [box(bounds)] })).toBeGreaterThan(0.6);
  });

  it('builds a point collection with the animation phase', () => {
    const [plant] = placeFoliage(bounds, none);
    const { features } = foliageToGeoJSON([plant]);
    expect(features[0].properties).toEqual({ kind: plant.kind, phase: plant.phase });
    expect(features[0].geometry.coordinates).toEqual([plant.position.longitude, plant.position.latitude]);
  });
});
