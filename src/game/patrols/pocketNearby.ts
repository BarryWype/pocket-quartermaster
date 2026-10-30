import { placeFightRules } from '@/content/placeFights';
import type { PlaceKind, SecretKind } from '@/content/places';
import { pocketRules, type NearbyKind } from '@/content/pocketMode';

import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { placesAround, type PlaceSpawn } from '../places/generate';
import { isFightPlace } from '../places/fights';
import { ruinReplacements } from '../places/ruins';
import { liveTreasureMaps } from '../rewards/treasure';
import { isPlaceRevealed, isRevealed } from '../reveal/reveal';
import type { SaveData } from '../save';
import { hasKey } from '../secrets/keys';
import { secretPlaces } from '../secrets/tips';

/** A spot the save knows about (treasure, secret place, replacement ruin), copied at hand-off. */
export type KnownSpot = {
  id: string;
  position: LatLng;
  startsAt: number;
  expiresAt: number;
};

export type NearbyWatch = {
  /** Fight place kinds revealed to the player and wanted (empty when fight events aren't wanted). */
  fightKinds: PlaceKind[];
  /** Ruins wanted and revealed. */
  ruins: boolean;
  /** Ruins grown where dug ones stood (ruinReplacements at hand-off). */
  replacementRuins: KnownSpot[];
  /** Treasure spots of live read maps (only when wanted and revealed). */
  treasure: KnownSpot[];
  /** Secret places of active tips, only when the player held a key at hand-off. */
  secrets: (KnownSpot & { secret: SecretKind })[];
  /** Places used / dug / won (save.usedPlaces) at hand-off. */
  used: Record<string, number>;
  /** Place id → its expiry, once alerted. */
  alerted: Record<string, number>;
};

export type NearbyAlert =
  | { kind: 'nearbyPlace'; placeId: string; place: PlaceKind | 'treasure'; position: LatLng; distance: number }
  | { kind: 'secretPlace'; placeId: string; secret: SecretKind; position: LatLng; distance: number };

const toSpot = (spawn: PlaceSpawn): KnownSpot => ({
  id: spawn.id,
  position: spawn.position,
  startsAt: spawn.startsAt,
  expiresAt: spawn.expiresAt,
});

const prune = (bookkeeping: Record<string, number>, now: number): Record<string, number> =>
  Object.fromEntries(Object.entries(bookkeeping).filter(([, expiresAt]) => expiresAt > now));

/**
 * The background watch from the save: which place kinds to watch and where the
 * known spots sit, all copied at hand-off. `alerted` carries over from
 * `previous`, dropping entries that have lapsed.
 */
export function snapshotNearby(
  save: SaveData,
  wanted: NearbyKind[],
  now: number,
  previous: NearbyWatch | null = null,
): NearbyWatch {
  const wants = (kind: NearbyKind) => wanted.includes(kind);
  const ruins = wants('ruins') && isPlaceRevealed(save, 'ruins');
  const treasureWanted = wants('treasure') && isRevealed(save, 'treasure');
  return {
    fightKinds: wants('fightEvents')
      ? (Object.keys(placeFightRules.kinds) as PlaceKind[]).filter((kind) => isPlaceRevealed(save, kind))
      : [],
    ruins,
    replacementRuins: ruins ? ruinReplacements(save, now).map(toSpot) : [],
    treasure: treasureWanted
      ? liveTreasureMaps(save, now).flatMap((map) =>
          map.location ? [{ id: map.id, position: map.location, startsAt: 0, expiresAt: map.expiresAt }] : [],
        )
      : [],
    secrets: hasKey(save)
      ? secretPlaces(save, now).map((spawn) => ({ ...toSpot(spawn), secret: spawn.kind as SecretKind }))
      : [],
    used: { ...save.usedPlaces },
    alerted: prune(previous?.alerted ?? {}, now),
  };
}

/**
 * Follows the fixes: a place within `meters` while it exists (startsAt <= fix
 * time < expiresAt), not used and not alerted yet, alerts once. Returns the
 * advanced watch and the alerts in fix order.
 */
export function stepNearby(
  watch: NearbyWatch,
  fixes: { position: LatLng; timestamp: number }[],
  now: number,
  meters: number = pocketRules.nearbyMeters,
): { watch: NearbyWatch; alerts: NearbyAlert[] } {
  const alerted = { ...watch.alerted };
  const alerts: NearbyAlert[] = [];
  const needsPlaces = watch.fightKinds.length > 0 || watch.ruins;
  for (const fix of fixes) {
    const t = fix.timestamp;
    const live = (spot: { startsAt: number; expiresAt: number }) => spot.startsAt <= t && spot.expiresAt > t;
    const generated: PlaceSpawn[] = needsPlaces
      ? placesAround(fix.position, t).filter(
          (spawn) =>
            live(spawn) &&
            !(spawn.id in watch.used) &&
            ((watch.ruins && spawn.kind === 'ruins') ||
              (isFightPlace(spawn.kind) && watch.fightKinds.includes(spawn.kind))),
        )
      : [];
    const alertsHere: NearbyAlert[] = [];
    for (const spawn of generated) {
      const distance = Math.round(distanceMeters(fix.position, spawn.position));
      if (spawn.id in alerted || distance > meters) continue;
      alertsHere.push({
        kind: 'nearbyPlace',
        placeId: spawn.id,
        place: spawn.kind,
        position: spawn.position,
        distance,
      });
      alerted[spawn.id] = spawn.expiresAt;
    }
    const spots: { spot: KnownSpot; place: PlaceKind | 'treasure'; secret?: SecretKind }[] = [
      ...watch.replacementRuins.map((spot) => ({ spot, place: 'ruins' as const })),
      ...watch.treasure.map((spot) => ({ spot, place: 'treasure' as const })),
      ...watch.secrets.map((spot) => ({ spot, place: spot.secret as PlaceKind, secret: spot.secret })),
    ];
    for (const { spot, place, secret } of spots) {
      if (spot.id in watch.used || spot.id in alerted || !live(spot)) continue;
      const distance = Math.round(distanceMeters(fix.position, spot.position));
      if (distance > meters) continue;
      alertsHere.push(
        secret
          ? { kind: 'secretPlace', placeId: spot.id, secret, position: spot.position, distance }
          : { kind: 'nearbyPlace', placeId: spot.id, place, position: spot.position, distance },
      );
      alerted[spot.id] = spot.expiresAt;
    }
    alerts.push(...alertsHere);
  }
  return {
    watch: {
      ...watch,
      alerted: prune(alerted, now),
    },
    alerts,
  };
}
