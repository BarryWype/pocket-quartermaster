import { VectorTile } from '@mapbox/vector-tile';
import type { Geometry, Position } from 'geojson';
import Pbf from 'pbf';

import { spawnConfig as defaultConfig } from '@/content/spawnConfig';
import { walkableRules as defaultRules, type WalkableRules } from '@/content/walkable';

import { distanceMeters } from './geo';
import type { LatLng, Spawn, SpawnConfig } from './types';

type Bbox = { minLat: number; minLon: number; maxLat: number; maxLon: number };
type Way = { points: LatLng[]; bbox: Bbox };
type Area = { rings: LatLng[][]; bbox: Bbox };

/** The parts of one map tile that decide where spawns may go. */
export type WalkableTile = { ways: Way[]; areas: Area[]; water: Area[] };

export type MapTile = { z: number; x: number; y: number };

type FeatureKind = 'way' | 'area' | 'water';
type Properties = Record<string, string | number | boolean>;

const METERS_PER_DEGREE = 111_320;
const LAYERS = ['transportation', 'landcover', 'landuse', 'park', 'water'];

export function mapTileAt(point: LatLng, zoom: number): MapTile {
  const n = 2 ** zoom;
  const lat = (point.latitude * Math.PI) / 180;
  return {
    z: zoom,
    x: Math.floor(((point.longitude + 180) / 360) * n),
    y: Math.floor(((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * n),
  };
}

export const mapTileKey = ({ z, x, y }: MapTile) => `${z}/${x}/${y}`;

export function parseMapTileKey(key: string): MapTile {
  const [z, x, y] = key.split('/').map(Number);
  return { z, x, y };
}

/** Whether an OpenMapTiles feature is a walkable way, a public area, water, or irrelevant. */
export function classifyFeature(
  layer: string,
  props: Properties,
  geometryType: number,
  rules: WalkableRules = defaultRules,
): FeatureKind | null {
  const is = (list: string[], value: unknown) => list.includes(String(value));
  const polygon = geometryType === 3;

  if (layer === 'water') return polygon ? 'water' : null;
  if (layer === 'transportation') {
    if (props.brunnel === 'tunnel' || props.indoor === 1 || props.indoor === true) return null;
    if (props.level !== undefined && Number(props.level) !== 0) return null;
    if (is(rules.forbiddenAccess, props.access) || is(rules.forbiddenAccess, props.foot)) return null;
    if (polygon) return is(rules.areaTransportClasses, props.class) ? 'area' : null;
    if (geometryType !== 2 || !is(rules.wayClasses, props.class)) return null;
    if (is(rules.excludedSubclasses, props.subclass) || is(rules.excludedServices, props.service)) return null;
    return 'way';
  }
  if (!polygon) return null;
  if (layer === 'landcover') return is(rules.landcoverSubclasses, props.subclass) ? 'area' : null;
  if (layer === 'landuse') return is(rules.landuseClasses, props.class) ? 'area' : null;
  if (layer === 'park') return is(rules.parkClasses, props.class) ? 'area' : null;
  return null;
}

const toLatLng = ([longitude, latitude]: Position): LatLng => ({ latitude, longitude });

function bboxOf(points: LatLng[]): Bbox {
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  return { minLat: Math.min(...lats), minLon: Math.min(...lons), maxLat: Math.max(...lats), maxLon: Math.max(...lons) };
}

/** Lines of a (multi)line geometry, or rings of each polygon of a (multi)polygon. */
function linesOf(geometry: Geometry): LatLng[][] {
  if (geometry.type === 'LineString') return [geometry.coordinates.map(toLatLng)];
  if (geometry.type === 'MultiLineString') return geometry.coordinates.map((line) => line.map(toLatLng));
  return [];
}

function polygonsOf(geometry: Geometry): LatLng[][][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates.map((ring) => ring.map(toLatLng))];
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(toLatLng)));
  }
  return [];
}

/** Decodes a vector tile and keeps only what spawn placement needs. */
export function decodeWalkableTile(bytes: Uint8Array, tile: MapTile, rules: WalkableRules = defaultRules): WalkableTile {
  const vectorTile = new VectorTile(new Pbf(bytes));
  const result: WalkableTile = { ways: [], areas: [], water: [] };

  for (const layerName of LAYERS) {
    const layer = vectorTile.layers[layerName];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const kind = classifyFeature(layerName, feature.properties, feature.type, rules);
      if (!kind) continue;
      const geometry = feature.toGeoJSON(tile.x, tile.y, tile.z).geometry;
      if (kind === 'way') {
        for (const points of linesOf(geometry)) result.ways.push({ points, bbox: bboxOf(points) });
      } else {
        for (const rings of polygonsOf(geometry)) {
          result[kind === 'area' ? 'areas' : 'water'].push({ rings, bbox: bboxOf(rings[0]) });
        }
      }
    }
  }
  return result;
}

function inBbox(bbox: Bbox, point: LatLng, marginMeters = 0) {
  const marginLat = marginMeters / METERS_PER_DEGREE;
  const marginLon = marginMeters / (METERS_PER_DEGREE * Math.cos((point.latitude * Math.PI) / 180));
  return (
    point.latitude >= bbox.minLat - marginLat &&
    point.latitude <= bbox.maxLat + marginLat &&
    point.longitude >= bbox.minLon - marginLon &&
    point.longitude <= bbox.maxLon + marginLon
  );
}

/** Even-odd ray casting over all rings, so holes count as outside. */
function contains(area: Area, point: LatLng) {
  if (!inBbox(area.bbox, point)) return false;
  let inside = false;
  for (const ring of area.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      const crosses =
        a.latitude > point.latitude !== b.latitude > point.latitude &&
        point.longitude <
          ((b.longitude - a.longitude) * (point.latitude - a.latitude)) / (b.latitude - a.latitude) + a.longitude;
      if (crosses) inside = !inside;
    }
  }
  return inside;
}

/**
 * Where a spawn generated at `point` actually goes: the point itself inside a
 * public area (and not in water), else the nearest point on a walkable way
 * within `maxMeters`, else nowhere.
 */
export function snapToWalkable(tile: WalkableTile, point: LatLng, maxMeters: number): LatLng | null {
  if (tile.areas.some((area) => contains(area, point)) && !tile.water.some((area) => contains(area, point))) {
    return point;
  }

  // Work in metres on a flat plane centred on the point; fine at these distances.
  const scaleX = METERS_PER_DEGREE * Math.cos((point.latitude * Math.PI) / 180);
  const toPlane = (p: LatLng) => ({
    x: (p.longitude - point.longitude) * scaleX,
    y: (p.latitude - point.latitude) * METERS_PER_DEGREE,
  });

  let best: { x: number; y: number } | null = null;
  let bestDistance = maxMeters;
  for (const way of tile.ways) {
    if (!inBbox(way.bbox, point, maxMeters)) continue;
    for (let i = 1; i < way.points.length; i++) {
      const a = toPlane(way.points[i - 1]);
      const b = toPlane(way.points[i]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared));
      const closest = { x: a.x + t * dx, y: a.y + t * dy };
      const distance = Math.hypot(closest.x, closest.y);
      if (distance <= bestDistance) {
        best = closest;
        bestDistance = distance;
      }
    }
  }
  if (!best) return null;
  return { latitude: point.latitude + best.y / METERS_PER_DEGREE, longitude: point.longitude + best.x / scaleX };
}

/**
 * Where a point goes: snapped onto its map tile's walkable places, kept as is
 * when the tile could not be loaded (null), undefined while it is still
 * loading, null when nothing walkable is near.
 */
export function placePoint(
  point: LatLng,
  tiles: Record<string, WalkableTile | null>,
  rules: WalkableRules = defaultRules,
): LatLng | null | undefined {
  const key = mapTileKey(mapTileAt(point, rules.mapZoom));
  if (!(key in tiles)) return undefined;
  const tile = tiles[key];
  return tile === null ? point : snapToWalkable(tile, point, rules.maxSnapMeters);
}

function pointsOf(spawn: Spawn): LatLng[] {
  return spawn.kind === 'animal' ? spawn.path.waypoints : [spawn.position];
}

/** Map tiles holding the points of these spawns, i.e. what must be loaded to place them. */
export function mapTileKeysFor(spawns: Spawn[], rules: WalkableRules = defaultRules): string[] {
  const keys = new Set<string>();
  for (const spawn of spawns) {
    for (const point of pointsOf(spawn)) keys.add(mapTileKey(mapTileAt(point, rules.mapZoom)));
  }
  return [...keys];
}

/**
 * Spawns that could end up visible once placed: within their visibility range
 * plus the snap distance (and, for animals, the reach of their path).
 */
export function placementCandidates(
  spawns: Spawn[],
  player: LatLng,
  config: SpawnConfig = defaultConfig,
  rules: WalkableRules = defaultRules,
): Spawn[] {
  return spawns.filter((spawn) => {
    const points = pointsOf(spawn);
    const reach = Math.max(0, ...points.flatMap((a) => points.map((b) => distanceMeters(a, b))));
    const nearest = Math.min(...points.map((p) => distanceMeters(player, p)));
    return nearest <= config.kinds[spawn.kind].visibilityMeters + rules.maxSnapMeters + reach;
  });
}

/**
 * Moves spawns onto walkable places, deterministically per map tile.
 * `tiles` maps tile keys to their data, or to null when the tile could not be
 * loaded (the spawn then keeps its generated position so the game still works
 * offline). Spawns whose tiles are not loaded yet are left out; spawns with
 * nowhere walkable nearby are dropped; animals keep the waypoints that place.
 */
export function placeSpawns(
  spawns: Spawn[],
  tiles: Record<string, WalkableTile | null>,
  rules: WalkableRules = defaultRules,
): Spawn[] {
  const place = (point: LatLng) => placePoint(point, tiles, rules);

  return spawns.flatMap((spawn): Spawn[] => {
    if (spawn.kind === 'animal') {
      const placed = spawn.path.waypoints.map(place);
      if (placed.some((p) => p === undefined)) return [];
      const waypoints = placed.filter((p): p is LatLng => p !== null && p !== undefined);
      return waypoints.length === 0 ? [] : [{ ...spawn, path: { ...spawn.path, waypoints } }];
    }
    const position = place(spawn.position);
    return position ? [{ ...spawn, position }] : [];
  });
}
