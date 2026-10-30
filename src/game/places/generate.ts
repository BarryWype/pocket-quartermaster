import { placeGroups, placeRules, type PlaceGroup, type PlaceKind } from '@/content/places';

import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import { randomPointInTile, tileAreaKm2, tilesAround, tilesWithin } from '../generation/tiles';
import type { LatLng } from '../generation/types';

const HOUR_MS = 3_600_000;

export type PlaceSpawn = {
  id: string;
  kind: PlaceKind;
  group: string;
  tile: string;
  position: LatLng;
  startsAt: number;
  expiresAt: number;
  /** In [0, 1): decides which locked mines show. */
  roll: number;
};

/**
 * The places of one tile: the slot count follows the tile's real area, and
 * each slot rotates on its own phase, so places in an area don't all move at
 * once. Everything derives from the group, tile and time, so every player at
 * the same time sees the same places.
 */
export function generateTilePlaces(group: PlaceGroup, tile: string, timeMs: number): PlaceSpawn[] {
  const windowMs = group.windowHours * HOUR_MS;
  const rng = createRng(`places|${group.id}|${tile}`);
  const expected = group.densityPerKm2 * tileAreaKm2(tile);
  const count = Math.floor(expected) + (rng.chance(expected - Math.floor(expected)) ? 1 : 0);
  const kinds = Object.keys(group.kinds) as PlaceKind[];
  return Array.from({ length: count }, (_, s) => {
    const offset = createRng(`places|${group.id}|${tile}|${s}`).next() * windowMs;
    const w = Math.floor((timeMs - offset) / windowMs);
    const startsAt = w * windowMs + offset;
    const spawnRng = createRng(`place|${group.id}|${tile}|${s}|${w}`);
    const kind = spawnRng.weighted(kinds, (k) => group.kinds[k] ?? 0);
    return {
      id: `place:${kind}:${tile}:${s}:${w}`,
      kind,
      group: group.id,
      tile,
      position: randomPointInTile(tile, spawnRng),
      startsAt,
      expiresAt: startsAt + windowMs,
      roll: spawnRng.next(),
    };
  });
}

/** Every place of the given groups in the tiles around a position. */
export function placesAround(position: LatLng, timeMs: number, groups: PlaceGroup[] = placeGroups): PlaceSpawn[] {
  return groups.flatMap((group) =>
    tilesAround(position, group.precision).flatMap((tile) => generateTilePlaces(group, tile, timeMs)),
  );
}

/** Every place of the given groups within `meters` of a position (quest targets look further than the map shows). */
export function placesWithin(position: LatLng, meters: number, timeMs: number, groups: PlaceGroup[] = placeGroups): PlaceSpawn[] {
  return groups
    .flatMap((group) => tilesWithin(position, meters, group.precision).flatMap((tile) => generateTilePlaces(group, tile, timeMs)))
    .filter((spawn) => distanceMeters(position, spawn.position) <= meters);
}

/** The group a kind belongs to. */
export function placeGroupOf(kind: PlaceKind): PlaceGroup {
  const group = placeGroups.find((g) => kind in g.kinds);
  if (!group) throw new Error(`No place group contains ${kind}`);
  return group;
}

/** A place shows while its window is live and the player is close enough. */
export function isPlaceVisible(spawn: PlaceSpawn, player: LatLng, now: number): boolean {
  return (
    spawn.expiresAt > now &&
    spawn.startsAt <= now &&
    distanceMeters(player, spawn.position) <= placeGroupOf(spawn.kind).visibilityMeters
  );
}

/** The ore tier a mine place doubles as, or null for non-mines. */
export function mineTier(kind: PlaceKind): number | null {
  const tiers = placeRules.mineTiers as Partial<Record<PlaceKind, number>>;
  return tiers[kind] ?? null;
}

export function isLockedMine(kind: PlaceKind, pickaxeTier: number): boolean {
  const tier = mineTier(kind);
  return tier !== null && tier > pickaxeTier;
}

/** Mines above the player's pickaxe tier only show for a share of their rolls. */
export function showsForPlayer(spawn: PlaceSpawn, pickaxeTier: number, lockedShare = placeRules.lockedMineShare): boolean {
  return !(isLockedMine(spawn.kind, pickaxeTier) && spawn.roll >= lockedShare);
}

/** Drops bookkeeping entries (place id → expiresAt) that have lapsed. */
export function prunePlaces<T extends Record<string, number>>(bookkeeping: T, now: number): T {
  const kept = Object.fromEntries(Object.entries(bookkeeping).filter(([, expiresAt]) => expiresAt > now));
  return kept as T;
}
