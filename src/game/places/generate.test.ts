import { placeGroups } from '@/content/places';

import { tileAt } from '../generation/tiles';
import { generateTilePlaces, isPlaceVisible, mineTier, placeGroupOf, showsForPlayer } from './generate';

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
    // +1 ms into the next window gives every slot a new id.
    const next = generateTilePlaces(tavernGroup, tile, now + tavernGroup.windowHours * HOUR_MS + 1);
    expect(next.map((s) => s.id)).not.toEqual(spawns.map((s) => s.id));
  });

  it('gives each place exactly its group window as a lifetime', () => {
    for (const group of [tavernGroup, fightGroup]) {
      const tile = tileAt(wellington, group.precision);
      for (const spawn of generateTilePlaces(group, tile, now)) {
        expect(spawn.expiresAt - spawn.startsAt).toBe(group.windowHours * HOUR_MS);
      }
    }
    expect(tavernGroup.windowHours).toBeLessThanOrEqual(72);
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

describe('mine gating', () => {
  const spawnOf = (kind: 'quarry' | 'coalPit', roll: number) =>
    ({ id: 'x', kind, group: kind, tile: 't', position: wellington, startsAt: 0, expiresAt: 1, roll }) as const;

  it('treats ore places as mine tiers', () => {
    expect(mineTier('quarry')).toBe(1);
    expect(mineTier('coalPit')).toBe(4);
    expect(mineTier('market')).toBeNull();
  });

  it('hides locked mines for rolls at or above the locked share, and always shows quarries at tier 1', () => {
    expect(showsForPlayer(spawnOf('coalPit', 0.49), 1)).toBe(true);
    expect(showsForPlayer(spawnOf('coalPit', 0.5), 1)).toBe(false);
    expect(showsForPlayer(spawnOf('coalPit', 0.1), 4)).toBe(true);
    expect(showsForPlayer(spawnOf('quarry', 0.99), 1)).toBe(true);
  });

  it('shows about half the coal pits to a tier-1 player over many tiles', () => {
    const tiles = Array.from({ length: 200 }, (_, i) => tileAt({ latitude: -41 + i * 0.06, longitude: 174 + i * 0.06 }, 5));
    const pits = tiles.flatMap((tile) => generateTilePlaces(placeGroupOf('coalPit'), tile, now));
    const shown = pits.filter((s) => showsForPlayer(s, 1)).length / pits.length;
    expect(pits.length).toBeGreaterThan(50);
    expect(Math.abs(shown - 0.5)).toBeLessThan(0.1);
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
