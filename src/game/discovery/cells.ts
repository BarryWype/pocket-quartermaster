import ngeohash from 'ngeohash';

import { supplyRules } from '@/content/supplyLines';

import { distanceMeters, interpolate } from '../generation/geo';
import type { LatLng } from '../generation/types';

/** The cell a position falls in, at the supply grid's precision. */
export function cellAt(position: LatLng): string {
  return ngeohash.encode(position.latitude, position.longitude, supplyRules.cellPrecision);
}

/**
 * The distinct cells a straight segment crosses, in order, stepping
 * `cellStepMeters` along it and keeping both ends' cells.
 */
export function cellsAlong(from: LatLng, to: LatLng): string[] {
  const steps = Math.ceil(distanceMeters(from, to) / supplyRules.cellStepMeters);
  if (steps === 0) return [cellAt(from)];
  const cells: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const cell = cellAt(interpolate(from, to, i / steps));
    if (cells[cells.length - 1] !== cell) cells.push(cell);
  }
  return cells;
}
