import { dungeons } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';

import { createInitialSave, type SaveData } from '../save';
import { isDungeonUnlocked, tierChain } from './unlock';

/** A save with exactly these dungeons cleared, past the tutorial. */
const saveWith = (...cleared: string[]): SaveData => ({
  ...createInitialSave(),
  tutorial: { ...createInitialSave().tutorial, step: 'done' },
  clearedDungeons: cleared,
});

describe('isDungeonUnlocked', () => {
  it('opens tier 1 index 0 from the start', () => {
    expect(isDungeonUnlocked(createInitialSave(), dungeonById.ratCellar)).toBe(true);
  });

  it('opens tier N index 0 once the tier N-1 boss is cleared', () => {
    expect(isDungeonUnlocked(saveWith(), dungeonById.sunkenFord)).toBe(false);
    expect(isDungeonUnlocked(saveWith('banditStockade'), dungeonById.sunkenFord)).toBe(true);
    expect(isDungeonUnlocked(saveWith('banditStockade'), dungeonById.stormRidge)).toBe(false);
  });

  it('opens index i once index i-1 of the same tier is cleared', () => {
    expect(isDungeonUnlocked(saveWith('ratCellar'), dungeonById.spiderBurrow)).toBe(true);
    expect(isDungeonUnlocked(saveWith('ratCellar'), dungeonById.oldGraveyard)).toBe(false);
    expect(isDungeonUnlocked(saveWith('ratCellar', 'spiderBurrow'), dungeonById.oldGraveyard)).toBe(true);
    expect(isDungeonUnlocked(saveWith('ratCellar', 'spiderBurrow'), dungeonById.goblinWarren)).toBe(false);
  });

  it('unlocks a chain dungeon once anything later in its tier is cleared, boss included (old saves)', () => {
    expect(isDungeonUnlocked(saveWith('ratCellar'), dungeonById.oldGraveyard)).toBe(false);
    expect(isDungeonUnlocked(saveWith('smugglersCove'), dungeonById.oldGraveyard)).toBe(true);
    // Clearing the tier boss opens the tier's whole chain.
    expect(isDungeonUnlocked(saveWith('banditStockade'), dungeonById.goblinWarren)).toBe(true);
    // The boss follows the same chain rule: index 5 cleared, nothing later.
    expect(isDungeonUnlocked(saveWith('smugglersCove'), dungeonById.banditStockade)).toBe(false);
    expect(isDungeonUnlocked(saveWith('millRuins'), dungeonById.banditStockade)).toBe(true);
  });

  it('keeps overnight and secret dungeons on the tier rule', () => {
    expect(isDungeonUnlocked(saveWith('banditStockade'), dungeonById.nightWatch2)).toBe(true);
    expect(isDungeonUnlocked(saveWith('sunkenFord', 'boarThicket', 'wolfDen', 'trollBridge'), dungeonById.nightWatch2)).toBe(false);
  });
});

describe('tierChain', () => {
  it('lists each tier chain in chainIndex order, boss last', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const chain = tierChain(tier);
      expect(chain.map((d) => d.chainIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(chain.map((d) => !!d.isBoss)).toEqual([false, false, false, false, false, false, true]);
      expect(dungeons.filter((d) => d.tier === tier && !d.overnight && !d.secret)).toHaveLength(7);
    }
  });
});
