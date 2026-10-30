import { lootConfig } from '@/content/loot/config';

import { distanceMeters } from '../generation/geo';
import { mapDistanceRange } from '../loot/treasure';
import { createInitialSave, type SaveData } from '../save';
import type { TreasureMap } from '../types';
import { pruneExpired } from '../upkeep';
import { collectTreasure, liveTreasureMaps, readTreasureMap, treasureContents, treasureLocation } from './treasure';

const here = { latitude: -41.2865, longitude: 174.7762 };
const map: TreasureMap = { id: 'map7', tier: 1, rarity: 'common', expiresAt: 10_000, location: null };
const withMap = (extra: Partial<SaveData> = {}): SaveData => ({ ...createInitialSave(), treasureMaps: [map], ...extra });

describe('treasure maps', () => {
  it('hides the treasure within its rarity range, fixed by the map id', () => {
    const spot = treasureLocation('map7', here, 'common');
    const d = distanceMeters(here, spot);
    const [min, max] = mapDistanceRange('common');
    expect(d).toBeGreaterThanOrEqual(min - 1);
    expect(d).toBeLessThanOrEqual(max + 1);
    expect(treasureLocation('map7', here, 'common')).toEqual(spot);
    expect(treasureLocation('map8', here, 'common')).not.toEqual(spot);
    // A rarer map lies further out.
    const [rareMin] = mapDistanceRange('rare');
    expect(distanceMeters(here, treasureLocation('map7', here, 'rare'))).toBeGreaterThanOrEqual(rareMin - 1);
  });

  it('pins the location on the first read only', () => {
    const read = readTreasureMap(withMap(), 'map7', here, 0);
    const pinned = read.treasureMaps[0].location;
    expect(pinned).not.toBeNull();
    const elsewhere = { latitude: here.latitude + 0.05, longitude: here.longitude };
    expect(readTreasureMap(read, 'map7', elsewhere, 0).treasureMaps[0].location).toEqual(pinned);
  });

  it('expires after its lifetime', () => {
    expect(liveTreasureMaps(withMap(), 9_999)).toHaveLength(1);
    expect(liveTreasureMaps(withMap(), 10_000)).toHaveLength(0);
    expect(() => readTreasureMap(withMap(), 'map7', here, 10_000)).toThrow();
    expect(pruneExpired(withMap(), 10_000).treasureMaps).toEqual([]);
  });

  it('holds gold for every rarity, and the legendary-only categories only for a legendary map', () => {
    const rarities = ['common', 'rare', 'legendary'] as const;
    const all = rarities.flatMap((rarity) =>
      Array.from({ length: 200 }, (_, i) => treasureContents(createInitialSave(), { ...map, id: `m${i}`, rarity })),
    );
    for (const contents of all) expect(contents.gold).toBeGreaterThan(0);
    for (const contents of all.filter((_c, i) => i < 200)) {
      for (const category of lootConfig.treasureMaps.legendaryOnly) expect(contents.dropped).not.toContain(category);
    }
  });

  it('is dug up in range, once, and pays its contents', () => {
    const read = readTreasureMap(withMap(), 'map7', here, 0);
    const spot = read.treasureMaps[0].location!;
    expect(() => collectTreasure(read, 'map7', here, spot, 0)).toThrow();
    const { save, contents } = collectTreasure(read, 'map7', spot, spot, 0);
    expect(save.treasureMaps).toEqual([]);
    expect(save.gold).toBeGreaterThanOrEqual(contents.gold);
  });
});
