import { treasureRules, treasureTiers } from '@/content/treasure';

import { shardId } from '../elements';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { pruneExpired } from '../upkeep';
import { collectTreasure, liveTreasureMaps, readTreasureMap, treasureContents, treasureLocation } from './treasure';

const here = { latitude: -41.2865, longitude: 174.7762 };
const map = { id: 'map7', tier: 2, expiresAt: 10_000, location: null };
const ORE = ['stone', 'copper', 'iron', 'coal', 'steel'];
const withMap = (extra: Partial<SaveData> = {}): SaveData => ({ ...createInitialSave(), treasureMaps: [map], ...extra });

describe('treasure maps', () => {
  it('hides the treasure 200–800 m away, fixed by the map id', () => {
    const spot = treasureLocation('map7', here);
    const d = distanceMeters(here, spot);
    expect(d).toBeGreaterThanOrEqual(treasureRules.distanceMeters[0] - 1);
    expect(d).toBeLessThanOrEqual(treasureRules.distanceMeters[1] + 1);
    expect(treasureLocation('map7', here)).toEqual(spot);
    expect(treasureLocation('map8', here)).not.toEqual(spot);
  });

  it('pins the location on the first read only', () => {
    const read = readTreasureMap(withMap(), 'map7', here, 0);
    const pinned = read.treasureMaps[0].location;
    expect(pinned).not.toBeNull();
    const elsewhere = offsetPosition(here, 5000, 0);
    expect(readTreasureMap(read, 'map7', elsewhere, 0).treasureMaps[0].location).toEqual(pinned);
  });

  it('expires after its lifetime', () => {
    expect(liveTreasureMaps(withMap(), 9_999)).toHaveLength(1);
    expect(liveTreasureMaps(withMap(), 10_000)).toHaveLength(0);
    expect(() => readTreasureMap(withMap(), 'map7', here, 10_000)).toThrow();
    expect(pruneExpired(withMap(), 10_000).treasureMaps).toEqual([]);
  });

  it('holds gold, shards by tier and no ore, sometimes a special', () => {
    const all = Array.from({ length: 400 }, (_, i) => treasureContents({ ...map, id: `m${i}` }));
    for (const contents of all) {
      expect(contents.gold).toBeGreaterThan(0);
      expect(contents.shards.amount).toBe(treasureTiers[1].shards);
      for (const { materialId } of contents.materials) expect(ORE).not.toContain(materialId);
    }
    const share = all.filter((c) => c.special).length / all.length;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.35);
    expect(new Set(all.map((c) => c.special?.kind).filter(Boolean))).toEqual(new Set(['sigil', 'jackpot', 'charter']));
  });

  it('pays shards and charters when dug up', () => {
    const charterMap = Array.from({ length: 400 }, (_, i) => ({ ...map, id: `m${i}` })).find(
      (m) => treasureContents(m).special?.kind === 'charter',
    )!;
    const read = readTreasureMap({ ...createInitialSave(), treasureMaps: [charterMap] }, charterMap.id, here, 0);
    const spot = read.treasureMaps[0].location!;
    const { save, contents } = collectTreasure(read, charterMap.id, spot, spot, 0);
    expect(save.charters).toBe(1);
    expect(save.materials[shardId(contents.shards.element)]).toBe(contents.shards.amount);
  });

  it('is dug up in range, once, and pays its contents', () => {
    const read = readTreasureMap(withMap(), 'map7', here, 0);
    const spot = read.treasureMaps[0].location!;
    expect(() => collectTreasure(read, 'map7', here, spot, 0)).toThrow();
    const { save, contents } = collectTreasure(read, 'map7', spot, spot, 0);
    expect(save.treasureMaps).toEqual([]);
    expect(save.gold).toBeGreaterThanOrEqual(contents.gold);
  });

  it('turns a Sigil into a jackpot at the cap', () => {
    const sigilMap = Array.from({ length: 400 }, (_, i) => ({ ...map, id: `m${i}` })).find(
      (m) => treasureContents(m).special?.kind === 'sigil',
    )!;
    const save: SaveData = { ...createInitialSave(), treasureMaps: [sigilMap], sigils: [1, 1, 1] };
    const read = readTreasureMap(save, sigilMap.id, here, 0);
    const spot = read.treasureMaps[0].location!;
    const { save: after, contents } = collectTreasure(read, sigilMap.id, spot, spot, 0);
    expect(contents.special?.kind).toBe('jackpot');
    expect(after.sigils).toEqual([1, 1, 1]);
  });
});
