import ngeohash from 'ngeohash';

import { offsetPosition } from './geo';
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

/** A tile's area in km²: bbox height × width, the width shrunk by cos of the centre latitude. */
export function tileAreaKm2(tile: string): number {
  const { minLat, minLon, maxLat, maxLon } = tileBounds(tile);
  const centreLat = (minLat + maxLat) / 2;
  const kmPerDegree = 111.32;
  const heightKm = (maxLat - minLat) * kmPerDegree;
  const widthKm = (maxLon - minLon) * kmPerDegree * Math.cos((centreLat * Math.PI) / 180);
  return heightKm * widthKm;
}

/** Every tile intersecting a square of ±meters around the position. */
export function tilesWithin(position: LatLng, meters: number, precision: number): string[] {
  const north = offsetPosition(position, meters, 0);
  const south = offsetPosition(position, -meters, 0);
  const east = offsetPosition(position, 0, meters);
  const west = offsetPosition(position, 0, -meters);
  return ngeohash.bboxes(south.latitude, west.longitude, north.latitude, east.longitude, precision);
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
