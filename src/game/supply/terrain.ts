import { supplyRules } from '@/content/supplyLines';
import { walkableRules } from '@/content/walkable';

import { tileBounds } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import { inArea, mapTileAt, mapTileKey, nearWater, type WalkableTile } from '../generation/walkable';
import type { Terrain } from './types';

/** The sample points a cell is classified on: a grid of centres inside its bounds. */
function samplePoints(cell: string): LatLng[] {
  const { minLat, minLon, maxLat, maxLon } = tileBounds(cell);
  const n = supplyRules.terrain.samplesPerSide;
  return Array.from({ length: n * n }, (_, i) => ({
    latitude: minLat + ((Math.floor(i / n) + 0.5) / n) * (maxLat - minLat),
    longitude: minLon + (((i % n) + 0.5) / n) * (maxLon - minLon),
  }));
}

/** The map tiles a cell's classification needs: one per sample point. */
export function cellTileKeys(cell: string): string[] {
  const keys = new Set<string>();
  for (const point of samplePoints(cell)) keys.add(mapTileKey(mapTileAt(point, walkableRules.mapZoom)));
  return [...keys];
}

/**
 * A cell's terrain, from its sample points' own map tiles: undefined while any
 * tile is loading or failed to load, 'water' when every point is in water,
 * then green, waterside and built in that order (see the design doc).
 */
export function cellTerrain(cell: string, tiles: Record<string, WalkableTile | null>): Terrain | 'water' | undefined {
  const points = samplePoints(cell);
  const per = points.map((point) => {
    const key = mapTileKey(mapTileAt(point, walkableRules.mapZoom));
    return key in tiles ? tiles[key] : undefined;
  });
  if (per.some((tile) => tile === undefined || tile === null)) return undefined;

  const inWater = points.map((point, i) => per[i]!.water.some((area) => inArea(area, point)));
  if (inWater.every(Boolean)) return 'water';
  const green = points.filter((point, i) => per[i]!.green.some((area) => inArea(area, point))).length;
  if (green / points.length >= supplyRules.terrain.greenShare) return 'green';
  if (inWater.some(Boolean) || points.some((point, i) => nearWater(per[i]!, point, supplyRules.terrain.waterEdgeMeters))) return 'waterside';
  return 'built';
}
