import { placeGroups } from '@/content/places';

import { tileAt } from '../generation/tiles';
import { generateTilePlaces, isPlaceVisible, placeGroupOf } from './generate';

const HOUR_MS = 3_600_000;
const wellington = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 9, 26, 12);
const tavernGroup = placeGroupOf('tavern');
const fightGroup = placeGroups.find((g) => g.id === 'fightEvents')!;

describe('generateTilePlaces', () => {
  it('is deterministic for the same tile and time, and moves with the window', () => {
    const tile = tileAt(wellington, tavernGroup.precision);
    const spawns = generateTilePlaces(tavernGroup, tile, now);
    expect(spawns.length).toBeGreaterThan(0);
    expect(generateTilePlaces(tavernGroup, tile, now)).toEqual(spawns);
    // Past every slot's expiry, each has rolled into a new window with a new id.
    const lastEnd = Math.max(...spawns.map((s) => s.expiresAt));
    const next = generateTilePlaces(tavernGroup, tile, lastEnd + 1);
    expect(next.map((s) => s.id)).not.toEqual(spawns.map((s) => s.id));
  });

  it('gives each place exactly its group window as a lifetime', () => {
    for (const group of [tavernGroup, fightGroup]) {
      const tile = tileAt(wellington, group.precision);
      for (const spawn of generateTilePlaces(group, tile, now)) {
        // A phased window follows local days, so a daylight-saving shift can bend it by an hour.
        const tolerance = group.phases ? HOUR_MS : 0;
        expect(Math.abs(spawn.expiresAt - spawn.startsAt - group.windowHours * HOUR_MS)).toBeLessThanOrEqual(tolerance);
      }
    }
    expect(tavernGroup.windowHours).toBe(144);
    expect(tavernGroup.phases).toBe(3);
    expect(fightGroup.windowHours).toBe(24);
  });

  it('staggers the windows of the slots of a tile', () => {
    const tiles = Array.from({ length: 60 }, (_, i) => tileAt({ latitude: -41.2 + i * 0.05, longitude: 174.7 + i * 0.05 }, tavernGroup.precision));
    const staggered = tiles.some((tile) => {
      const starts = new Set(generateTilePlaces(tavernGroup, tile, now).map((s) => s.startsAt));
      return starts.size > 1;
    });
    expect(staggered).toBe(true);
  });

  it('generates spawns live at the time asked for', () => {
    for (const group of placeGroups) {
      const tile = tileAt(wellington, group.precision);
      for (const spawn of generateTilePlaces(group, tile, now)) {
        expect(spawn.startsAt).toBeLessThanOrEqual(now);
        expect(spawn.expiresAt).toBeGreaterThan(now);
      }
    }
  });
});

describe('isPlaceVisible', () => {
  it('needs the window live and the player within visibility', () => {
    const tile = tileAt(wellington, tavernGroup.precision);
    const spawn = generateTilePlaces(tavernGroup, tile, now)[0]!;
    const atSpawn = { ...spawn, position: wellington };
    expect(isPlaceVisible(atSpawn, wellington, now)).toBe(true);
    expect(isPlaceVisible({ ...atSpawn, startsAt: now + 1 }, wellington, now)).toBe(false);
    expect(isPlaceVisible({ ...atSpawn, expiresAt: now }, wellington, now)).toBe(false);
    expect(isPlaceVisible(atSpawn, { latitude: wellington.latitude + 0.05, longitude: wellington.longitude }, now)).toBe(false);
  });
});
