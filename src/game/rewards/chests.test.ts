import { chests } from '@/content/chests';
import { recipes } from '@/content/recipes';

import { createInitialSave, type SaveData } from '../save';
import { chestState, dayKey, openChest, recordSteps, stepsRecorded, syncSteps } from './chests';

const wooden = chests.find((c) => c.id === 'wooden')!;
const iron = chests.find((c) => c.id === 'iron')!;
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
  it('unlock at their step tier', () => {
    const save = createInitialSave();
    expect(chestState(save, wooden, 4999, today)).toBe('locked');
    expect(chestState(save, wooden, 5000, today)).toBe('ready');
    expect(chestState(save, iron, 5000, today)).toBe('locked');
    expect(chestState(save, iron, 10000, today)).toBe('ready');
  });

  it('opens once per day and gives gold', () => {
    const { save, reward } = openChest(createInitialSave(), 'wooden', 6000, today);
    expect(reward.gold).toBeGreaterThanOrEqual(10);
    expect(save.gold).toBe(reward.gold);
    expect(chestState(save, wooden, 6000, today)).toBe('opened');
    expect(() => openChest(save, 'wooden', 6000, today)).toThrow();
    expect(chestState(save, wooden, 6000, '2026-10-25')).toBe('ready');
  });

  it('refuses chests that are still locked', () => {
    expect(() => openChest(createInitialSave(), 'iron', 9000, today)).toThrow();
  });

  it('gives the same reward for the same day', () => {
    expect(openChest(createInitialSave(), 'iron', 10000, today).reward).toEqual(
      openChest(createInitialSave(), 'iron', 10000, today).reward,
    );
  });

  it('only teaches recipes the player does not know', () => {
    const days = Array.from({ length: 200 }, (_, i) => `2026-01-${i}`);
    const taught = days
      .map((day) => openChest(createInitialSave(), 'iron', 10000, day))
      .filter(({ reward }) => reward.recipeId);
    expect(taught.length).toBeGreaterThan(0);
    const known = createInitialSave().knownRecipes;
    taught.forEach(({ save, reward }) => {
      expect(known).not.toContain(reward.recipeId);
      expect(save.knownRecipes).toContain(reward.recipeId);
    });
  });

  it('never teaches a recipe when everything is known', () => {
    const allKnown: SaveData = { ...createInitialSave(), knownRecipes: recipes.map((r) => r.id) };
    for (let i = 0; i < 50; i++) {
      expect(openChest(allKnown, 'iron', 10000, `day-${i}`).reward.recipeId).toBeNull();
    }
  });
});

describe('step chest loot', () => {
  it('never holds ore or ingots', () => {
    const ore = ['stone', 'copper', 'iron', 'coal', 'steel'];
    for (const chest of chests) for (const entry of chest.loot) expect(ore).not.toContain(entry.materialId);
  });
});
