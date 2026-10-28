import { createRng } from './rng';
import type { LatLng } from './types';

export type FoliageKind = 'bush' | 'blossom' | 'tree' | 'pine' | 'birch' | 'post' | 'smoke';

/** A decorative bush, tree or building corner post. `phase` offsets a plant's animation frame. */
export type Foliage = { id: string; kind: FoliageKind; position: LatLng; phase: number };

/** [west, south, east, north], as MapLibre returns bounds. */
export type Bounds = [west: number, south: number, east: number, north: number];

/** Map features foliage avoids, or grows denser in. */
export type FoliageObstacles = {
  /** Areas foliage never grows in: water, buildings, sand… */
  blocked: GeoJSON.Feature[];
  /** Lines foliage keeps `clearance` metres away from: roads, paths, streams. */
  lines: { feature: GeoJSON.Feature; clearance: number }[];
  /** Areas where trees are more common than bushes: woods and parks. */
  wooded: GeoJSON.Feature[];
};

export const foliageConfig = {
  /** One candidate per grid cell this size, in metres. */
  cellMeters: 14,
  /** Chance a cell grows anything, in the open and in woods. */
  density: { open: 0.7, wooded: 0.95 },
  /** Chance a plant is a tree, in the open and in woods. */
  treeChance: { open: 0.2, wooded: 0.75 },
  /** Sprites a tree or a bush is drawn with, picked evenly; repeats make one more common. */
  trees: ['tree', 'tree', 'pine', 'birch'] as FoliageKind[],
  bushes: ['bush', 'bush', 'blossom'] as FoliageKind[],
  /** Cap so a zoomed-out view stays cheap. */
  maxCount: 1400,
  frames: 4,
  /** A building corner turns at least this much (degrees) to get a post. */
  postMinTurn: 30,
  maxPosts: 600,
  /** Share of building corners with a chimney smoking, in the evening. */
  smokeShare: 0.08,
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
    linesOf(feature).map((line) => ({ line, clearance, box: paddedBox(line, clearance) })),
  );

  const placed: Foliage[] = [];
  for (const { roll, ...candidate } of foliageCandidates(bounds, config)) {
    const point: Point = [candidate.position.longitude, candidate.position.latitude];
    if (blocked.some((area) => inArea(point, area))) continue;
    if (lines.some(({ line, clearance, box }) => inBox(point, box) && nearLine(point, line, clearance))) continue;

    const inWoods = wooded.some((area) => inArea(point, area));
    if (!inWoods && roll >= config.density.open) continue;
    const treeChance = inWoods ? config.treeChance.wooded : config.treeChance.open;
    // A second seeded roll so the kind doesn't depend on which features loaded.
    const rng = createRng(`foliage-kind|${candidate.id}`);
    const kinds = rng.chance(treeChance) ? config.trees : config.bushes;
    const kind = kinds[rng.int(0, kinds.length - 1)];
    placed.push({ ...candidate, kind });
    if (placed.length >= config.maxCount) break;
  }
  return placed;
}

/**
 * Timber posts on the corners of the buildings in view. Vector tiles clip
 * buildings at tile edges, which adds corners that aren't real; those sit on
 * edges running exactly north–south or east–west, so corners touching one are
 * skipped (a few real ones go too). The same building comes back once per
 * tile, so posts are deduplicated by position.
 */
export function buildingPosts(bounds: Bounds, buildings: GeoJSON.Feature[], config = foliageConfig): Foliage[] {
  const posts = new Map<string, Foliage>();
  const straight = (a: Point, b: Point) => a[0] === b[0] || a[1] === b[1];
  for (const ring of buildings.flatMap(polygonsOf).flat()) {
    // Rings are closed: the last point repeats the first.
    const points = ring.slice(0, -1);
    for (let i = 0; i < points.length && posts.size < config.maxPosts; i++) {
      const before = points[(i + points.length - 1) % points.length];
      const at = points[i];
      const after = points[(i + 1) % points.length];
      if (straight(before, at) || straight(at, after)) continue;
      if (!inBox(at, bounds) || turnDegrees(before, at, after) < config.postMinTurn) continue;
      const id = `post:${at[0].toFixed(6)}:${at[1].toFixed(6)}`;
      posts.set(id, { id, kind: 'post', position: { longitude: at[0], latitude: at[1] }, phase: 0 });
    }
  }
  return [...posts.values()];
}

/** Smoke rising from a few of the posts, picked by position so the same chimneys smoke. */
export function chimneySmoke(posts: Foliage[], config = foliageConfig): Foliage[] {
  return posts.flatMap((post) => {
    const rng = createRng(`smoke|${post.id}`);
    if (!rng.chance(config.smokeShare)) return [];
    return [{ ...post, id: `smoke:${post.id}`, kind: 'smoke' as const, phase: rng.int(0, config.frames - 1) }];
  });
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

/** A line's bounding box, grown by `meters` on every side. */
function paddedBox(line: Point[], meters: number): Bounds {
  const [west, south, east, north] = withBox([line]).box;
  const lat = meters / METERS_PER_DEGREE;
  const lng = lat / Math.cos((south * Math.PI) / 180);
  return [west - lng, south - lat, east + lng, north + lat];
}

const inBox = ([lng, lat]: Point, box: Bounds) => lng >= box[0] && lng <= box[2] && lat >= box[1] && lat <= box[3];

function inArea(point: Point, { polygon, box }: Area) {
  if (!inBox(point, box)) return false;
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

/** How far the outline turns at `at`, in degrees, measured in a local metre projection. */
function turnDegrees(before: Point, at: Point, after: Point) {
  const metersPerLng = METERS_PER_DEGREE * Math.cos((at[1] * Math.PI) / 180);
  const heading = (from: Point, to: Point) => Math.atan2((to[1] - from[1]) * METERS_PER_DEGREE, (to[0] - from[0]) * metersPerLng);
  const turn = Math.abs(heading(at, after) - heading(before, at)) % (2 * Math.PI);
  return (Math.min(turn, 2 * Math.PI - turn) * 180) / Math.PI;
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
