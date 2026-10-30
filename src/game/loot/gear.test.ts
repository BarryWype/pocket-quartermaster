import { QUALITIES } from '@/content/forging';
import type { GearType, Quality } from '@/game/types';

import { createRng, type Rng } from '../generation/rng';
import { lootGearQuality, lootGearTier, rollLootGear } from './gear';
import type { LootRequest } from './roll';
import type { LootSourceId } from './types';

const context = (playerTier: number) => ({
  playerTier,
  pickaxeTier: 3,
  knownRecipes: [] as string[],
  favouredTypes: [] as GearType[],
});

const request = (source: LootSourceId, seed: string, overrides: Partial<LootRequest> = {}): LootRequest => ({
  source,
  tier: 3,
  enemies: [],
  base: { gold: 0, xp: 0 },
  context: context(3),
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
  ...overrides,
});

const scripted = (die: number): Rng => ({
  next: () => 0,
  int: () => die,
  chance: () => false,
  weighted: <T,>(items: readonly T[]) => items[0],
});

const gearOver = (source: LootSourceId, rolls: number, overrides: Partial<LootRequest> = {}) =>
  Array.from({ length: rolls }, (_, i) => rollLootGear(request(source, `${source}${i}`, overrides)));

describe('looted gear', () => {
  it('gives dungeon sources the source tier', () => {
    const dungeon: LootSourceId[] = ['dungeonRun', 'firstWin', 'firstTierClear', 'tierBoss', 'overnightQuest'];
    for (const source of dungeon) {
      for (const piece of gearOver(source, 20, { tier: 4 })) {
        expect(piece.itemId).toMatch(/4$/);
      }
    }
  });

  it('gives other sources the player tier or one below', () => {
    for (const piece of gearOver('patrolGoblins', 200, { context: context(3) })) {
      expect(piece.itemId).toMatch(/[23]$/);
    }
    for (const piece of gearOver('patrolGoblins', 200, { context: context(1) })) {
      expect(piece.itemId).toMatch(/1$/);
    }
    let atPlayerTier = 0;
    for (const piece of gearOver('stepChest', 2000, { context: context(3) })) {
      if (piece.itemId.endsWith('3')) atPlayerTier += 1;
    }
    expect(atPlayerTier / 2000).toBeGreaterThan(0.6);
    expect(atPlayerTier / 2000).toBeLessThan(0.8);
    expect(lootGearTier('stepChest', 5, 1, createRng('low'))).toBe(1);
  });

  it('keeps the basic ladder below Rare and the big ladder below Legendary', () => {
    for (const piece of gearOver('dungeonRun', 300)) {
      expect(['crappy', 'normal', 'uncommon']).toContain(piece.quality);
    }
    for (const piece of gearOver('wantedOutlaw', 300)) {
      expect(piece.quality).not.toBe('legendary');
    }
  });

  it('holds the source floors', () => {
    for (const piece of gearOver('firstTierClear', 100)) {
      expect(QUALITIES.indexOf(piece.quality)).toBeGreaterThanOrEqual(QUALITIES.indexOf('uncommon'));
    }
    for (const piece of gearOver('monsterLair', 100)) {
      expect(QUALITIES.indexOf(piece.quality)).toBeGreaterThanOrEqual(QUALITIES.indexOf('rare'));
    }
  });

  it('shifts the ladder one step per 10 Luck', () => {
    // A d20 of 14 is Normal on the basic ladder, Uncommon with +1.
    expect(lootGearQuality('dungeonRun', scripted(14), 0)).toBe('normal');
    expect(lootGearQuality('dungeonRun', scripted(14), 1)).toBe('uncommon');
    expect(lootGearQuality('dungeonRun', scripted(5), 0)).toBe('crappy');
    expect(lootGearQuality('dungeonRun', scripted(5), 1)).toBe('normal');
    const lucky = gearOver('dungeonRun', 300, { luck: 10 });
    const plain = gearOver('dungeonRun', 300);
    const average = (pieces: { quality: Quality }[]) =>
      pieces.reduce((sum, piece) => sum + QUALITIES.indexOf(piece.quality), 0) / pieces.length;
    expect(average(lucky)).toBeGreaterThan(average(plain));
  });

  it('rolls stats within the roll range', () => {
    for (const piece of gearOver('dungeonRun', 300)) {
      expect(piece.roll).toBeGreaterThanOrEqual(0.94);
      expect(piece.roll).toBeLessThanOrEqual(1.06);
      expect(piece.uid).toBe('');
    }
  });
});
