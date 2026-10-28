import { gatheringConfig } from '@/content/gatheringConfig';
import { resources } from '@/content/resources';

import type { Spawn, StaticSpawn } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import { TUTORIAL_SPAWN_ID, tutorialSpawns } from '../tutorial/tutorial';
import { bonusForGather, collectSpawn, freshGathersLeft, localDayKey } from './gathering';

const NOW = Date.UTC(2026, 5, 10, 9);
const LATER = NOW + 7 * 24 * 3_600_000;
const bonus = gatheringConfig.walkingBonus;
const at = { position: { latitude: 0, longitude: 0 }, speed: 0 };

/** A static spawn of one resource, close to the gatherer and far from expiring. */
const spawnOf = (resourceId: string, id: string): StaticSpawn => ({
  id,
  kind: 'wood',
  resourceId,
  tile: 't',
  quantity: 1,
  boosted: false,
  expiresAt: LATER,
  position: { latitude: 0, longitude: 0 },
});

/** Past the tutorial, with the day's bonus gathers optionally already spent. */
const saveSpent = (spent: boolean): SaveData => ({
  ...createInitialSave(),
  tutorial: { step: 'done', woodSpot: null },
  freshGathers: spent ? { day: localDayKey(NOW), used: bonus.gathers } : { day: '', used: 0 },
});

describe('daily walking bonus', () => {
  it('gives the first gathers of a local day ×1.5, rounded up', () => {
    const tree = spawnOf('tree', 'wood:1');
    const plain = collectSpawn(saveSpent(true), tree, at, NOW);
    const boosted = collectSpawn(saveSpent(false), tree, at, NOW);
    if (!plain.ok || !boosted.ok) throw new Error('collect failed');
    const plainYield = resources.find((r) => r.id === 'tree')!.yields;
    expect(plain.gained).toEqual(plainYield.map((y) => ({ materialId: y.materialId, amount: y.amount })));
    for (const stack of boosted.gained) {
      expect(stack.amount).toBe(Math.ceil(plain.gained.find((g) => g.materialId === stack.materialId)!.amount * bonus.multiplier));
    }
  });

  it('runs out after the configured gathers and resets the next local day', () => {
    let save = saveSpent(false);
    for (let i = 0; i < bonus.gathers; i++) {
      const result = collectSpawn(save, spawnOf('tree', `wood:${i}`), at, NOW + i);
      if (!result.ok) throw new Error(result.reason);
      save = result.save;
    }
    expect(freshGathersLeft(save, NOW)).toBe(0);
    // One more gather the same day: the plain yield.
    const extra = collectSpawn(save, spawnOf('tree', 'wood:extra'), at, NOW + 60_000);
    expect(extra.ok && extra.gained).toEqual([{ materialId: 'wood', amount: 1 }]);
    expect(extra.ok && freshGathersLeft(extra.save, NOW + 60_000)).toBe(0);
    // The next local day the counter starts over.
    const nextDay = new Date(NOW + 24 * 3_600_000);
    const tomorrow = Date.UTC(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate() + 1, 9);
    expect(freshGathersLeft(save, tomorrow)).toBe(bonus.gathers);
    const again = collectSpawn(save, spawnOf('tree', 'wood:next'), at, tomorrow);
    expect(again.ok && again.gained).toEqual([{ materialId: 'wood', amount: Math.ceil(bonus.multiplier) }]);
  });

  it('never counts the tutorial’s guaranteed wood node', () => {
    const save = { ...createInitialSave(), tutorial: { ...createInitialSave().tutorial, woodSpot: { latitude: 0, longitude: 0 } } };
    const [tutorial] = tutorialSpawns(save) as Spawn[];
    expect(tutorial.id).toBe(TUTORIAL_SPAWN_ID);
    const result = collectSpawn(save, tutorial, at, NOW);
    if (!result.ok) throw new Error(result.reason);
    // The yield is not multiplied, and the bonus gather budget is untouched.
    const wood = result.gained.find((g) => g.materialId === 'wood')!;
    expect(wood.amount).toBe(result.gained.reduce((s, g) => s + g.amount, 0) / result.gained.length);
    expect(result.gained.every((g) => g.amount === tutorial.quantity)).toBe(true);
    expect(freshGathersLeft(result.save, NOW)).toBe(bonus.gathers);
    expect(bonusForGather(result.save, tutorial, NOW)).toBeNull();
  });

  it('keys the day on the player’s local calendar date', () => {
    // Local noon, whatever the machine's timezone.
    const noon = new Date(2026, 5, 11, 12).getTime();
    expect(localDayKey(noon)).toBe(localDayKey(noon + 3_600_000));
    // One in the morning is the next local day.
    expect(localDayKey(noon)).not.toBe(localDayKey(noon + 13 * 3_600_000));
  });
});
