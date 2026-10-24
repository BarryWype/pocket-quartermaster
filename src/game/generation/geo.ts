import type { LatLng } from './types';

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Moves a position by a number of metres north and east (flat-earth approximation). */
export function offsetPosition(position: LatLng, northMeters: number, eastMeters: number): LatLng {
  const metresPerDegree = (Math.PI / 180) * EARTH_RADIUS_M;
  return {
    latitude: position.latitude + northMeters / metresPerDegree,
    longitude:
      position.longitude +
      eastMeters / (metresPerDegree * Math.cos(toRadians(position.latitude))),
  };
}

export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}
