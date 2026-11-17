import { placeGroups, placeRules, type PlaceGroup, type PlaceKind } from '@/content/places';
import { siteGroup } from '@/content/supplyLines';

import { distanceMeters } from '../generation/geo';
import { localDayIndex, localDayStart } from '../generation/localDays';
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
  /** In [0, 1): a spare roll, kept so spawn ids stay stable. */
  roll: number;
};

/**
 * The places of one tile: the slot count follows the tile's real area, and
 * each slot rotates on its own phase, so places in an area don't all move at
 * once. A phased group splits its slots into `phases` seeded groups, each
 * replaced at the change hour on its own day of the window. Everything derives
 * from the group, tile and time, so every player at the same time sees the
 * same places.
 */
export function generateTilePlaces(group: PlaceGroup, tile: string, timeMs: number): PlaceSpawn[] {
  const windowMs = group.windowHours * HOUR_MS;
  const rng = createRng(`places|${group.id}|${tile}`);
  const expected = group.densityPerKm2 * tileAreaKm2(tile);
  const count = Math.floor(expected) + (rng.chance(expected - Math.floor(expected)) ? 1 : 0);
  const kinds = Object.keys(group.kinds) as PlaceKind[];
  return Array.from({ length: count }, (_, s) => {
    const slotRng = createRng(`places|${group.id}|${tile}|${s}`);
    let startsAt: number;
    let expiresAt: number;
    let w: number;
    if (group.phases) {
      // The slot's phase group, replaced every window at the change hour on its own day.
      const phase = Math.floor(slotRng.next() * group.phases);
      const days = group.windowHours / 24;
      const step = days / group.phases;
      const d = localDayIndex(timeMs, placeRules.changeHourLocal);
      w = Math.floor((d - phase * step) / days);
      const firstDay = w * days + phase * step;
      startsAt = localDayStart(firstDay, placeRules.changeHourLocal);
      expiresAt = localDayStart(firstDay + days, placeRules.changeHourLocal);
    } else {
      const offset = slotRng.next() * windowMs;
      w = Math.floor((timeMs - offset) / windowMs);
      startsAt = w * windowMs + offset;
      expiresAt = startsAt + windowMs;
    }
    const spawnRng = createRng(`place|${group.id}|${tile}|${s}|${w}`);
    const kind = spawnRng.weighted(kinds, (k) => group.kinds[k] ?? 0);
    return {
      id: `place:${kind}:${tile}:${s}:${w}`,
      kind,
      group: group.id,
      tile,
      position: randomPointInTile(tile, spawnRng),
      startsAt,
      expiresAt,
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

/** The group a kind belongs to; sites live outside `placeGroups` (see content/supplyLines.ts). */
export function placeGroupOf(kind: PlaceKind): PlaceGroup {
  const group = kind === 'site' ? siteGroup : placeGroups.find((g) => kind in g.kinds);
  if (!group) throw new Error(`No place group contains ${kind}`);
  return group;
}

/** A place shows while its window is live and the player is close enough. */
export function isPlaceVisible(spawn: PlaceSpawn, player: LatLng, now: number, multiplier = 1): boolean {
  return (
    spawn.expiresAt > now &&
    spawn.startsAt <= now &&
    distanceMeters(player, spawn.position) <= placeGroupOf(spawn.kind).visibilityMeters * multiplier
  );
}

