import ngeohash from 'ngeohash';

import type { Rng } from './rng';
import type { LatLng } from './types';

export type TileBounds = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

export function tileAt(position: LatLng, precision: number): string {
  return ngeohash.encode(position.latitude, position.longitude, precision);
}

/** The tile containing the position plus its 8 neighbours. */
export function tilesAround(position: LatLng, precision: number): string[] {
  const center = tileAt(position, precision);
  return [center, ...ngeohash.neighbors(center)];
}

export function tileBounds(tile: string): TileBounds {
  const [minLat, minLon, maxLat, maxLon] = ngeohash.decode_bbox(tile);
  return { minLat, minLon, maxLat, maxLon };
}

export function tileCenter(tile: string): LatLng {
  const { latitude, longitude } = ngeohash.decode(tile);
  return { latitude, longitude };
}

export function randomPointInTile(tile: string, rng: Rng): LatLng {
  const bounds = tileBounds(tile);
  return {
    latitude: bounds.minLat + rng.next() * (bounds.maxLat - bounds.minLat),
    longitude: bounds.minLon + rng.next() * (bounds.maxLon - bounds.minLon),
  };
}
