import { nearbyKinds, type NearbyKind } from '@/content/pocketMode';

import { distanceMeters, interpolate, offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { placesAround, type PlaceSpawn } from '../places/generate';
import { isFightPlace } from '../places/fights';
import { createInitialSave, type SaveData } from '../save';
import type { SecretTip } from '../types';
import { snapshotNearby, stepNearby, type NearbyWatch } from './pocketNearby';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const BASE = 1_700_000_000_000;
const start: LatLng = { latitude: 51.5, longitude: -0.12 };
const all: NearbyKind[] = [...nearbyKinds];

/** A save that sees everything and is past the tutorial. */
const readySave = (): SaveData => {
  const save = createInitialSave();
  return { ...save, revealAll: true, tutorial: { ...save.tutorial, step: 'done' } };
};

/** Walks the clock until a live place of the wanted sort sits near `start`. */
const findSpawn = (wanted: (spawn: PlaceSpawn) => boolean): { spawn: PlaceSpawn; at: number } => {
  for (let t = BASE; t < BASE + 200 * 6 * HOUR; t += 6 * HOUR) {
    const spawn = placesAround(start, t).find(wanted);
    if (spawn) return { spawn, at: t };
  }
  throw new Error('No such place found near the start');
};

/** A fix `meters` from a place, on the line towards the start. */
const fixNear = (place: LatLng, meters: number, at: number) => ({
  position: interpolate(place, start, meters / distanceMeters(place, start)),
  timestamp: at,
});

describe('Pocket mode nearby-place alerts', () => {
  it('alerts once for a fight place within 150 m, not at 200 m, and not twice', () => {
    const { spawn, at } = findSpawn((s) => isFightPlace(s.kind));
    const watch = snapshotNearby(readySave(), all, at);
    expect(watch.fightKinds).toContain(spawn.kind);
    const far = stepNearby(watch, [fixNear(spawn.position, 200, at)], at);
    expect(far.alerts.filter((a) => a.kind === 'nearbyPlace' && a.placeId === spawn.id)).toEqual([]);
    const near = stepNearby(far.watch, [fixNear(spawn.position, 100, at + 1000)], at + 1000);
    const [alert] = near.alerts.filter((a) => a.kind === 'nearbyPlace' && a.placeId === spawn.id);
    expect(alert).toMatchObject({ kind: 'nearbyPlace', placeId: spawn.id, place: spawn.kind, distance: 100 });
    const again = stepNearby(near.watch, [fixNear(spawn.position, 100, at + 2000)], at + 2000);
    expect(again.alerts.filter((a) => a.kind === 'nearbyPlace' && a.placeId === spawn.id)).toEqual([]);
  });

  it('gives no alert when nothing is wanted, or when nothing is revealed yet', () => {
    const { spawn, at } = findSpawn((s) => isFightPlace(s.kind));
    const fixes = [fixNear(spawn.position, 0, at)];
    const notWanted = stepNearby(snapshotNearby(readySave(), [], at), fixes, at);
    expect(notWanted.alerts).toEqual([]);
    const save = createInitialSave();
    const fresh = { ...save, tutorial: { ...save.tutorial, step: 'done' as const } };
    const watch = snapshotNearby(fresh, all, at);
    expect(watch.fightKinds).toEqual([]);
    expect(watch.ruins).toBe(false);
    expect(watch.treasure).toEqual([]);
    expect(stepNearby(watch, fixes, at).alerts).toEqual([]);
  });

  it('skips a used ruin but alerts for the replacement grown in its stead', () => {
    const { spawn, at } = findSpawn((s) => s.kind === 'ruins');
    const save = readySave();
    save.usedPlaces[spawn.id] = at + DAY;
    save.dugRuins['place:ruins:x:0:0'] = { dugAt: at - 25 * HOUR, position: start };
    const watch = snapshotNearby(save, ['ruins'], at);
    expect(watch.replacementRuins).toHaveLength(1);
    const replacement = watch.replacementRuins[0];
    const stepped = stepNearby(watch, [fixNear(replacement.position, 100, at)], at);
    const ids = stepped.alerts.filter((a) => a.kind === 'nearbyPlace').map((a) => (a as { placeId: string }).placeId);
    expect(ids).toContain(replacement.id);
    expect(ids).not.toContain(spawn.id);
    expect(stepped.alerts.find((a) => a.kind === 'nearbyPlace' && a.placeId === replacement.id)).toMatchObject({
      place: 'ruins',
      distance: 100,
    });
  });

  it('alerts for a treasure spot of a live read map, and drops an expired map', () => {
    const at = BASE;
    const save = readySave();
    save.treasureMaps = [
      { id: 'map:gone', tier: 1, rarity: 'common', expiresAt: at, location: offsetPosition(start, 0, 100) },
      { id: 'map:1', tier: 1, rarity: 'common', expiresAt: at + DAY, location: offsetPosition(start, 0, 100) },
    ];
    const watch = snapshotNearby(save, ['treasure'], at);
    expect(watch.treasure.map((spot) => spot.id)).toEqual(['map:1']);
    const stepped = stepNearby(watch, [{ position: start, timestamp: at }], at);
    expect(stepped.alerts).toMatchObject([
      { kind: 'nearbyPlace', placeId: 'map:1', place: 'treasure', distance: 100 },
    ]);
  });

  it('alerts for a secret place only when the player holds a key', () => {
    const at = BASE;
    const tip: SecretTip = {
      id: 'hiddenDen|library-1',
      secret: 'hiddenDen',
      source: 'library',
      sourceId: 'library-1',
      anchor: start,
      foundAt: at - HOUR,
      expiresAt: at + DAY,
      position: offsetPosition(start, 0, 100),
    };
    const save = readySave();
    save.secretTips = [tip];
    const withoutKey = snapshotNearby(save, [], at);
    expect(withoutKey.secrets).toEqual([]);
    expect(stepNearby(withoutKey, [{ position: start, timestamp: at }], at).alerts).toEqual([]);
    const withKey = snapshotNearby({ ...save, keyFragments: 4 }, [], at);
    expect(withKey.secrets).toHaveLength(1);
    const stepped = stepNearby(withKey, [{ position: start, timestamp: at }], at);
    expect(stepped.alerts).toMatchObject([
      { kind: 'secretPlace', placeId: 'secret:hiddenDen|library-1', secret: 'hiddenDen', distance: 100 },
    ]);
  });

  it('ignores an expired place, and carries `alerted` over while pruning lapsed entries', () => {
    const { spawn, at } = findSpawn((s) => isFightPlace(s.kind));
    const watch = snapshotNearby(readySave(), all, at);
    const stepped = stepNearby(watch, [fixNear(spawn.position, 100, at)], at);
    expect(stepped.watch.alerted[spawn.id]).toBe(spawn.expiresAt);
    const later = fixNear(spawn.position, 0, spawn.expiresAt + 1000);
    const rotated = stepNearby(stepped.watch, [later], spawn.expiresAt + 1000);
    expect(rotated.alerts.find((a) => a.kind === 'nearbyPlace' && a.placeId === spawn.id)).toBeUndefined();
    const carried = snapshotNearby(readySave(), all, at + 1000, stepped.watch);
    expect(carried.alerted[spawn.id]).toBe(spawn.expiresAt);
    const pruned = snapshotNearby(readySave(), all, spawn.expiresAt + 1, stepped.watch as NearbyWatch);
    expect(pruned.alerted[spawn.id]).toBeUndefined();
  });
});
