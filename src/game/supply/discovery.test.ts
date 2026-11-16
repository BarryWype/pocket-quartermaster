import { placeRules } from '@/content/places';

import { offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { placesAround, type PlaceSpawn } from '../places/generate';
import { createInitialSave } from '../save';
import { pruneExpired } from '../upkeep';
import { discoverAlong, discoverAt, isDiscovered, isNetworkKind } from './discovery';

const HOUR = 3_600_000;
const BASE = 1_700_000_000_000;
const start: LatLng = { latitude: 51.5, longitude: -0.12 };

/** Walks the clock until a live place of the wanted sort sits near `start`. */
const findSpawn = (wanted: (spawn: PlaceSpawn) => boolean): { spawn: PlaceSpawn; at: number } => {
  for (let t = BASE; t < BASE + 200 * 6 * HOUR; t += 6 * HOUR) {
    const spawn = placesAround(start, t).find(wanted);
    if (spawn) return { spawn, at: t };
  }
  throw new Error('No such place found near the start');
};

describe('network place discovery', () => {
  it('discovers a network place within interaction range, at its own expiry', () => {
    const { spawn, at } = findSpawn((s) => isNetworkKind(s.kind));
    const save = createInitialSave();
    const { save: next, found } = discoverAt(save, [spawn], spawn.position, at);
    expect(found.map((place) => place.id)).toEqual([spawn.id]);
    expect(isDiscovered(next, spawn.id)).toBe(true);
    expect(next.supply.discovered[spawn.id]).toBe(spawn.expiresAt);
  });

  it(`leaves a place ${placeRules.interactionMeters + 10} m away undiscovered, and gives the same save back`, () => {
    const { spawn, at } = findSpawn((s) => isNetworkKind(s.kind));
    const save = createInitialSave();
    const far = offsetPosition(spawn.position, placeRules.interactionMeters + 10, 0);
    const result = discoverAt(save, [spawn], far, at);
    expect(result.found).toEqual([]);
    expect(result.save).toBe(save);
  });

  it('never discovers a place of a kind outside the network', () => {
    const { spawn, at } = findSpawn((s) => s.kind === 'chapel');
    expect(isNetworkKind(spawn.kind)).toBe(false);
    const { save: next, found } = discoverAt(createInitialSave(), [spawn], spawn.position, at);
    expect(found).toEqual([]);
    expect(next.supply.discovered).toEqual({});
  });

  it('ignores a place whose window has ended', () => {
    const { spawn } = findSpawn((s) => isNetworkKind(s.kind));
    const { save: next, found } = discoverAt(createInitialSave(), [spawn], spawn.position, spawn.expiresAt);
    expect(found).toEqual([]);
    expect(next.supply.discovered).toEqual({});
  });

  it("doesn't find an already discovered place twice", () => {
    const { spawn, at } = findSpawn((s) => isNetworkKind(s.kind));
    const first = discoverAt(createInitialSave(), [spawn], spawn.position, at);
    const again = discoverAt(first.save, [spawn], spawn.position, at);
    expect(again.found).toEqual([]);
    expect(again.save).toBe(first.save);
  });

  it('finds a place passed along a path of fixes', () => {
    const { spawn, at } = findSpawn((s) => isNetworkKind(s.kind));
    const save = createInitialSave();
    const fixes = [
      { position: offsetPosition(spawn.position, placeRules.interactionMeters + 10, 0), timestamp: at },
      { position: spawn.position, timestamp: at + 1000 },
    ];
    const { save: next, found } = discoverAlong(save, fixes, {});
    expect(found.map((place) => place.id)).toEqual([spawn.id]);
    expect(isDiscovered(next, spawn.id)).toBe(true);
  });

  it('prunes discovered places once expired, and changes nothing while they live', () => {
    const { spawn, at } = findSpawn((s) => isNetworkKind(s.kind));
    const { save: discovered } = discoverAt(createInitialSave(), [spawn], spawn.position, at);
    expect(pruneExpired(discovered, spawn.expiresAt - 1)).toBe(discovered);
    const pruned = pruneExpired(discovered, spawn.expiresAt);
    expect(pruned.supply.discovered).toEqual({});
    expect(pruned).not.toBe(discovered);
  });
});
