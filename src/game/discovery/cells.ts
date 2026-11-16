import ngeohash from 'ngeohash';

import { supplyRules } from '@/content/supplyLines';

import { distanceMeters, interpolate } from '../generation/geo';
import type { LatLng } from '../generation/types';

/**
 * Scouted cells in compact form: by precision-5 prefix, then by the period each
 * cell was last walked in, the cells' 2-character suffixes back to back. A cell
 * sits in one period only, so walking it again moves it to the current one.
 */
export type CellSet = Record<string, Record<number, string>>;

/** The cell a position falls in, at the supply grid's precision. */
export function cellAt(position: LatLng): string {
  return ngeohash.encode(position.latitude, position.longitude, supplyRules.cellPrecision);
}

/**
 * The distinct cells a straight segment crosses, in order, stepping
 * `scoutStepMeters` along it and keeping both ends' cells.
 */
export function cellsAlong(from: LatLng, to: LatLng): string[] {
  const steps = Math.ceil(distanceMeters(from, to) / supplyRules.scoutStepMeters);
  if (steps === 0) return [cellAt(from)];
  const cells: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const cell = cellAt(interpolate(from, to, i / steps));
    if (cells[cells.length - 1] !== cell) cells.push(cell);
  }
  return cells;
}

/** The 2-character suffixes of one period entry, one per cell. */
function suffixesOf(chunk: string): string[] {
  return chunk.match(/.{2}/g) ?? [];
}

/** Whether a period entry holds a cell's suffix. */
function holds(chunk: string, suffix: string): boolean {
  return suffixesOf(chunk).includes(suffix);
}

/**
 * Adds cells walked in `period`, moving each from the older period entry it
 * sat in. Returns the same object when nothing changes; drops entries left
 * without cells.
 */
export function addCells(set: CellSet, cells: string[], period: number): CellSet {
  const prefixOf = (cell: string) => cell.slice(0, supplyRules.cellPrecision - 2);
  const suffixOf = (cell: string) => cell.slice(supplyRules.cellPrecision - 2);
  const periodOf = (cell: string): number | null => {
    const periods = set[prefixOf(cell)];
    if (!periods) return null;
    for (const [p, chunk] of Object.entries(periods)) if (holds(chunk, suffixOf(cell))) return Number(p);
    return null;
  };

  if (cells.every((cell) => periodOf(cell) === period)) return set;

  const next: CellSet = {};
  for (const [prefix, periods] of Object.entries(set)) {
    next[prefix] = Object.fromEntries(Object.entries(periods).map(([p, chunk]) => [Number(p), chunk]));
  }
  for (const cell of cells) {
    const prefix = prefixOf(cell);
    const suffix = suffixOf(cell);
    const periods = (next[prefix] ??= {});
    for (const [p, chunk] of Object.entries(periods)) {
      if (!holds(chunk, suffix)) continue;
      const kept = suffixesOf(chunk).filter((s) => s !== suffix).join('');
      if (kept === '') delete periods[Number(p)];
      else periods[Number(p)] = kept;
    }
    periods[period] = (periods[period] ?? '') + suffix;
  }
  for (const [prefix, periods] of Object.entries(next)) {
    if (Object.keys(periods).length === 0) delete next[prefix];
  }
  return next;
}

/** The period a cell was last walked in, or null when it was never scouted. */
export function cellPeriod(set: CellSet, cell: string): number | null {
  const periods = set[cell.slice(0, supplyRules.cellPrecision - 2)];
  if (!periods) return null;
  for (const [p, chunk] of Object.entries(periods)) if (holds(chunk, cell.slice(supplyRules.cellPrecision - 2))) return Number(p);
  return null;
}

/** Whether the set holds a cell. */
export function isScouted(set: CellSet, cell: string): boolean {
  return cellPeriod(set, cell) !== null;
}

/** Every cell in the set. */
export function allCells(set: CellSet): string[] {
  return Object.entries(set).flatMap(([prefix, periods]) =>
    Object.values(periods).flatMap((chunk) => suffixesOf(chunk).map((suffix) => prefix + suffix)),
  );
}

/** How many cells the set holds. */
export function cellCount(set: CellSet): number {
  return Object.values(set).reduce((sum, periods) => sum + Object.values(periods).reduce((n, chunk) => n + suffixesOf(chunk).length, 0), 0);
}
