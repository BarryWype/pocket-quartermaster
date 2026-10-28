import { buildingPosts, foliageCandidates, foliageConfig, foliageToGeoJSON, placeFoliage, type Bounds, type FoliageObstacles } from './foliage';

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
    expect(plants.length).toBeGreaterThan(100);
    expect(plants.length).toBeLessThan(300);
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
      placeFoliage(bounds, none).length * 1.2,
    );
  });

  it('grows mostly trees in woods and mostly bushes in the open', () => {
    const share = (obstacles: FoliageObstacles) => {
      const plants = placeFoliage(bounds, obstacles);
      return plants.filter((p) => foliageConfig.trees.includes(p.kind)).length / plants.length;
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

describe('building posts', () => {
  const polygon = (ring: number[][]): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } });
  // A slightly rotated house, so no wall runs exactly north–south or east–west.
  const house = polygon([
    [174.776, -41.287],
    [174.7762, -41.28699],
    [174.77621, -41.2868],
    [174.77601, -41.28681],
    [174.776, -41.287],
  ]);

  it('puts one post on each corner, once even when the building comes back from two tiles', () => {
    const posts = buildingPosts(bounds, [house, house]);
    expect(posts).toHaveLength(4);
    expect(posts.every((p) => p.kind === 'post')).toBe(true);
  });

  it('skips nearly straight bends and corners on tile clipping edges', () => {
    const bent = polygon([
      [174.776, -41.287],
      [174.7761, -41.286995],
      [174.7762, -41.28699],
      [174.77621, -41.2868],
      [174.77601, -41.28681],
      [174.776, -41.287],
    ]);
    expect(buildingPosts(bounds, [bent])).toHaveLength(4);
    // Cut by a tile edge at longitude 174.7761: the cut runs exactly north–south.
    const clipped = polygon([
      [174.776, -41.287],
      [174.7761, -41.286995],
      [174.7761, -41.286805],
      [174.77601, -41.28681],
      [174.776, -41.287],
    ]);
    expect(buildingPosts(bounds, [clipped])).toHaveLength(2);
  });
});
