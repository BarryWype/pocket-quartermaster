import { createRng } from './rng';
import type { LatLng } from './types';

export type FoliageKind = 'bush' | 'tree';

/** A decorative bush or tree. `phase` offsets its animation frame. */
export type Foliage = { id: string; kind: FoliageKind; position: LatLng; phase: number };

/** [west, south, east, north], as MapLibre returns bounds. */
export type Bounds = [west: number, south: number, east: number, north: number];

/** Map features foliage avoids, or grows denser in. */
export type FoliageObstacles = {
  /** Areas foliage never grows in: water, buildings, residential, sand… */
  blocked: GeoJSON.Feature[];
  /** Lines foliage keeps `clearance` metres away from: roads, paths, streams. */
  lines: { feature: GeoJSON.Feature; clearance: number }[];
  /** Areas where trees are more common than bushes: woods and parks. */
  wooded: GeoJSON.Feature[];
};

export const foliageConfig = {
  /** One candidate per grid cell this size, in metres. */
  cellMeters: 22,
  /** Chance a cell grows anything, in the open and in woods. */
  density: { open: 0.45, wooded: 0.8 },
  /** Chance a plant is a tree, in the open and in woods. */
  treeChance: { open: 0.2, wooded: 0.75 },
  /** Cap so a zoomed-out view stays cheap. */
  maxCount: 400,
  frames: 4,
};

const METERS_PER_DEGREE = 111_320;

/**
 * Seeded candidate spots on a global grid, so the same place always grows
 * the same plants. Cells are fixed in degrees; the cell height is used for
 * both axes, so cells get narrower towards the poles, which is fine here.
 */
export function foliageCandidates(bounds: Bounds, config = foliageConfig): Candidate[] {
  const [west, south, east, north] = bounds;
  const step = config.cellMeters / METERS_PER_DEGREE;
  const candidates: Candidate[] = [];
  for (let row = Math.floor(south / step); row * step < north; row++) {
    for (let col = Math.floor(west / step); col * step < east; col++) {
      const rng = createRng(`foliage|${row}|${col}`);
      // Rolled at the highest density; placeFoliage thins it out in the open.
      const roll = rng.next();
      if (roll >= config.density.wooded) continue;
      const position = { latitude: (row + rng.next()) * step, longitude: (col + rng.next()) * step };
      if (position.latitude < south || position.latitude > north) continue;
      if (position.longitude < west || position.longitude > east) continue;
      candidates.push({ id: `${row}:${col}`, position, phase: rng.int(0, config.frames - 1), roll });
    }
  }
  return candidates;
}

/** Keeps the candidates that land on open ground and picks bush or tree. */
export function placeFoliage(bounds: Bounds, obstacles: FoliageObstacles, config = foliageConfig): Foliage[] {
  const blocked = obstacles.blocked.map(polygonsOf).flat().map(withBox);
  const wooded = obstacles.wooded.map(polygonsOf).flat().map(withBox);
  const lines = obstacles.lines.flatMap(({ feature, clearance }) =>
    linesOf(feature).map((line) => ({ line, clearance })),
  );

  const placed: Foliage[] = [];
  for (const { roll, ...candidate } of foliageCandidates(bounds, config)) {
    const point: Point = [candidate.position.longitude, candidate.position.latitude];
    if (blocked.some((area) => inArea(point, area))) continue;
    if (lines.some(({ line, clearance }) => nearLine(point, line, clearance))) continue;

    const inWoods = wooded.some((area) => inArea(point, area));
    if (!inWoods && roll >= config.density.open) continue;
    const treeChance = inWoods ? config.treeChance.wooded : config.treeChance.open;
    // A second seeded roll so the kind doesn't depend on which features loaded.
    const kind: FoliageKind = createRng(`foliage-kind|${candidate.id}`).chance(treeChance) ? 'tree' : 'bush';
    placed.push({ ...candidate, kind });
    if (placed.length >= config.maxCount) break;
  }
  return placed;
}

export function foliageToGeoJSON(foliage: Foliage[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: foliage.map((plant) => ({
      type: 'Feature',
      id: plant.id,
      properties: { kind: plant.kind, phase: plant.phase },
      geometry: { type: 'Point', coordinates: [plant.position.longitude, plant.position.latitude] },
    })),
  };
}

type Candidate = Omit<Foliage, 'kind'> & { roll: number };
type Point = [lng: number, lat: number];
type Ring = Point[];
type Polygon = Ring[];
type Area = { polygon: Polygon; box: Bounds };

function polygonsOf(feature: GeoJSON.Feature): Polygon[] {
  const { geometry } = feature;
  if (geometry?.type === 'Polygon') return [geometry.coordinates as Polygon];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates as Polygon[];
  return [];
}

function linesOf(feature: GeoJSON.Feature): Point[][] {
  const { geometry } = feature;
  if (geometry?.type === 'LineString') return [geometry.coordinates as Point[]];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates as Point[][];
  return [];
}

function withBox(polygon: Polygon): Area {
  const box: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of polygon[0] ?? []) {
    box[0] = Math.min(box[0], lng);
    box[1] = Math.min(box[1], lat);
    box[2] = Math.max(box[2], lng);
    box[3] = Math.max(box[3], lat);
  }
  return { polygon, box };
}

function inArea(point: Point, { polygon, box }: Area) {
  const [lng, lat] = point;
  if (lng < box[0] || lng > box[2] || lat < box[1] || lat > box[3]) return false;
  // Inside the outer ring and outside every hole.
  return polygon.every((ring, i) => inRing(point, ring) === (i === 0));
}

/** Ray casting. */
function inRing([x, y]: Point, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point-to-polyline distance check in a local metre projection. */
function nearLine(point: Point, line: Point[], clearance: number) {
  const metersPerLng = METERS_PER_DEGREE * Math.cos((point[1] * Math.PI) / 180);
  const toLocal = ([lng, lat]: Point) => [(lng - point[0]) * metersPerLng, (lat - point[1]) * METERS_PER_DEGREE];
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = toLocal(line[i - 1]);
    const [bx, by] = toLocal(line[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    if (Math.hypot(ax + t * dx, ay + t * dy) < clearance) return true;
  }
  return false;
}
