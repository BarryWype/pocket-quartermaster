import { recipes } from '@/content/recipes';

import { createRng } from '../generation/rng';
import { lootChances } from '../loot/chances';
import { rollForSave } from '../loot/context';
import { mergeLoot } from '../loot/roll';

import { createInitialSave, type SaveData } from '../save';
import { chestState, dayKey, openChest, recordSteps, stepChests, stepsRecorded, syncSteps } from './chests';

const wooden = stepChests[0];
const iron = stepChests[1];
const top = stepChests[stepChests.length - 1];
const today = '2026-10-24';

describe('daily steps', () => {
  it('formats local days', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('accumulates steps within a day and restarts on a new day', () => {
    let save = recordSteps(createInitialSave(), today, 1200);
    save = recordSteps(save, today, 300);
    expect(stepsRecorded(save, today)).toBe(1500);
    expect(stepsRecorded(save, '2026-10-25')).toBe(0);
    expect(stepsRecorded(recordSteps(save, '2026-10-25', 10), '2026-10-25')).toBe(10);
  });

  it('syncs to an OS total without going backwards', () => {
    const save = recordSteps(createInitialSave(), today, 800);
    expect(stepsRecorded(syncSteps(save, today, 3000), today)).toBe(3000);
    expect(stepsRecorded(syncSteps(save, today, 500), today)).toBe(800);
  });
});

describe('chests', () => {
  it('open at 2,000, 5,000, 8,000 and 12,000 steps, the last two at ×1.5', () => {
    expect(stepChests.map((c) => c.steps)).toEqual([2000, 5000, 8000, 12000]);
    expect(stepChests.map((c) => c.chanceMultiplier)).toEqual([1, 1, 1.5, 1.5]);
    const chance = (c: (typeof stepChests)[number]) =>
      lootChances({ source: 'stepChest', luck: 0, modifiers: [], chanceMultiplier: c.chanceMultiplier }).gear;
    expect(chance(stepChests[2])).toBeCloseTo(chance(stepChests[0]) * 1.5);
  });

  it('reset each day', () => {
    const { save } = openChest(createInitialSave(), wooden.id, wooden.steps, today, 0);
    expect(chestState(save, wooden, wooden.steps, today)).toBe('opened');
    expect(chestState(save, wooden, wooden.steps, '2026-10-25')).toBe('ready');
  });

  it('unlock at their step tier', () => {
    const save = createInitialSave();
    expect(chestState(save, wooden, wooden.steps - 1, today)).toBe('locked');
    expect(chestState(save, wooden, wooden.steps, today)).toBe('ready');
    expect(chestState(save, iron, wooden.steps, today)).toBe('locked');
    expect(chestState(save, iron, iron.steps, today)).toBe('ready');
  });

  it('open once per day and pay gold', () => {
    const { save, reward } = openChest(createInitialSave(), wooden.id, wooden.steps + 1000, today, 0);
    expect(reward.gold).toBeGreaterThan(0);
    expect(save.gold).toBe(reward.gold);
    expect(chestState(save, wooden, wooden.steps + 1000, today)).toBe('opened');
    expect(() => openChest(save, wooden.id, wooden.steps + 1000, today, 0)).toThrow();
    expect(chestState(save, wooden, wooden.steps + 1000, '2026-10-25')).toBe('ready');
  });

  it('refuse chests that are still locked', () => {
    expect(() => openChest(createInitialSave(), iron.id, iron.steps - 1, today, 0)).toThrow();
  });

  it('roll the top chest once more per Step chests rank, merged; other chests ignore the track', () => {
    const save: SaveData = { ...createInitialSave(), guild: { stepChests: 2 } };
    const rolls = [0, 1, 2].map((i) =>
      rollForSave(save, 'stepChest', createRng(i === 0 ? `chest|${top.id}|${today}` : `chest|${top.id}|${today}|${i}`), {
        chanceMultiplier: top.chanceMultiplier,
      }),
    );
    let merged = rolls[0];
    for (const roll of rolls.slice(1)) merged = mergeLoot(merged, roll);
    expect(openChest(save, top.id, top.steps, today, 0).reward).toEqual(merged);
    expect(openChest(save, wooden.id, wooden.steps, today, 0).reward).toEqual(
      openChest(createInitialSave(), wooden.id, wooden.steps, today, 0).reward,
    );
  });

  it('give the same reward for the same day', () => {
    expect(openChest(createInitialSave(), iron.id, iron.steps, today, 0).reward).toEqual(
      openChest(createInitialSave(), iron.id, iron.steps, today, 0).reward,
    );
  });

  it('never teach a recipe the player knows', () => {
    const days = Array.from({ length: 200 }, (_, i) => `2026-01-${i}`);
    const known = createInitialSave().knownRecipes;
    for (const day of days) {
      const { reward } = openChest(createInitialSave(), iron.id, iron.steps, day, 0);
      for (const recipeId of reward.recipeIds) expect(known).not.toContain(recipeId);
    }
    const allKnown: SaveData = { ...createInitialSave(), knownRecipes: recipes.map((r) => r.id) };
    for (let i = 0; i < 50; i++) {
      expect(openChest(allKnown, iron.id, iron.steps, `day-${i}`, 0).reward.recipeIds).toEqual([]);
    }
  });
});
