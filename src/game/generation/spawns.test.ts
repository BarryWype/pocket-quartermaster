import { spawnConfig } from '@/content/spawnConfig';

import { generateSpawnsAround, generateTileSpawns } from './spawns';
import { tileAt, tileBounds, tilesAround } from './tiles';
import { windowRange } from './time';
import type { ResourceKind, Spawn } from './types';

const wellington = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 9, 24, 3, 0);

function manyTiles(kind: ResourceKind, count: number): string[] {
  const precision = spawnConfig.kinds[kind].precision;
  const tiles = new Set<string>();
  for (let i = 0; tiles.size < count; i++) {
    const position = { latitude: -41.2 - i * 0.01, longitude: 174.7 + (i % 50) * 0.01 };
    tilesAround(position, precision).forEach((tile) => tiles.add(tile));
  }
  return [...tiles].slice(0, count);
}

function countResource(spawns: Spawn[], resourceId: string) {
  return spawns.filter((spawn) => spawn.resourceId === resourceId).length;
}

describe('generateTileSpawns', () => {
  const tile = tileAt(wellington, 6);

  it('returns identical spawns for the same tile and window', () => {
    expect(generateTileSpawns('ore', tile, 100)).toEqual(generateTileSpawns('ore', tile, 100));
  });

  it('returns different spawns in a different window', () => {
    expect(generateTileSpawns('ore', tile, 100)).not.toEqual(generateTileSpawns('ore', tile, 101));
  });

  it('places static spawns inside the tile with stable unique ids', () => {
    const spawns = generateTileSpawns('ore', tile, 100);
    const bounds = tileBounds(tile);
    expect(new Set(spawns.map((s) => s.id)).size).toBe(spawns.length);
    for (const spawn of spawns) {
      if (spawn.kind === 'animal') throw new Error('expected a static spawn');
      expect(spawn.id.startsWith(`ore:${tile}:100:`)).toBe(true);
      expect(spawn.position.latitude).toBeGreaterThanOrEqual(bounds.minLat);
      expect(spawn.position.latitude).toBeLessThanOrEqual(bounds.maxLat);
    }
  });

  it('respects per-tile counts and expires at the end of the window', () => {
    const { minPerTile, maxPerTile, windowMinutes } = spawnConfig.kinds.ore;
    const spawns = generateTileSpawns('ore', tile, 100);
    expect(spawns.length).toBeGreaterThanOrEqual(minPerTile);
    expect(spawns.length).toBeLessThanOrEqual(maxPerTile);
    spawns.forEach((spawn) => expect(spawn.expiresAt).toBe(windowRange(100, windowMinutes).end));
  });

  it('gives animals a path instead of a fixed position', () => {
    const spawns = manyTiles('animal', 100).flatMap((t) => generateTileSpawns('animal', t, 5));
    expect(spawns.length).toBeGreaterThan(0);
    spawns.forEach((spawn) => {
      expect(spawn.kind).toBe('animal');
      expect('path' in spawn).toBe(true);
    });
  });

  it('only resources of the requested kind spawn', () => {
    const herbIds = ['herb', 'berries', 'mushroom'];
    manyTiles('herb', 30)
      .flatMap((t) => generateTileSpawns('herb', t, 7))
      .forEach((spawn) => expect(herbIds).toContain(spawn.resourceId));
  });

  it('makes deer more common at dawn than during the day', () => {
    const tiles = manyTiles('animal', 2000);
    const at = (timeOfDay: 'dawn' | 'day') =>
      tiles.flatMap((t) => generateTileSpawns('animal', t, 3, { timeOfDay }));
    expect(countResource(at('dawn'), 'deer')).toBeGreaterThan(countResource(at('day'), 'deer') * 1.3);
  });

  it('marks boosted spawns and gives them extra quantity', () => {
    const spawns = manyTiles('animal', 1000).flatMap((t) =>
      generateTileSpawns('animal', t, 3, { timeOfDay: 'dawn' }),
    );
    const deer = spawns.filter((s) => s.resourceId === 'deer');
    const boar = spawns.filter((s) => s.resourceId === 'boar');
    deer.forEach((s) => expect(s.boosted).toBe(true));
    deer.forEach((s) => expect(s.quantity).toBeGreaterThanOrEqual(2));
    boar.forEach((s) => expect(s.boosted).toBe(false));
  });

  it('spawns rare drops in only a small share of tiles', () => {
    const tiles = manyTiles('rare', 500);
    const withRare = tiles.filter((t) => generateTileSpawns('rare', t, 42).length > 0).length;
    expect(withRare / tiles.length).toBeGreaterThan(0.02);
    expect(withRare / tiles.length).toBeLessThan(0.16);
  });

  it('uses configurable windows', () => {
    const config = {
      ...spawnConfig,
      kinds: { ...spawnConfig.kinds, ore: { ...spawnConfig.kinds.ore, windowMinutes: 1 } },
    };
    const spawns = generateTileSpawns('ore', tile, 100, { config });
    spawns.forEach((spawn) => expect(spawn.expiresAt).toBe(windowRange(100, 1).end));
  });
});

describe('generateSpawnsAround', () => {
  it('gives two players in the same tile the same spawns', () => {
    const nearby = { latitude: wellington.latitude + 0.00001, longitude: wellington.longitude };
    expect(tileAt(nearby, 7)).toBe(tileAt(wellington, 7));
    expect(generateSpawnsAround(nearby, now)).toEqual(generateSpawnsAround(wellington, now));
  });

  it('is stable within a window and changes after it', () => {
    const later = now + 10 * 60_000;
    const nextDay = now + 24 * 3_600_000;
    const ore = (time: number) =>
      generateSpawnsAround(wellington, time).filter((spawn) => spawn.kind === 'ore');
    expect(ore(later)).toEqual(ore(now));
    expect(ore(nextDay)).not.toEqual(ore(now));
  });

  it('includes every regular resource kind', () => {
    const kinds = new Set(generateSpawnsAround(wellington, now).map((spawn) => spawn.kind));
    expect(kinds.has('ore')).toBe(true);
    expect(kinds.has('animal')).toBe(true);
    expect(kinds.has('herb')).toBe(true);
  });
});
