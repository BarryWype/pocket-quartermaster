import { lootConfig } from '@/content/loot/config';

import { createRng } from '../generation/rng';
import { rollForSave } from '../loot/context';
import { grantLoot } from '../loot/grant';
import type { Loot } from '../loot/types';
import type { SaveData } from '../save';

/** A step chest of the day: opens at `steps`, rolls the Step chest row with its chance multiplier. */
export type StepChest = { id: string; steps: number; chanceMultiplier: number };

export const stepChests: StepChest[] = lootConfig.stepChests.thresholds.map((steps, i) => ({
  id: `steps${steps}`,
  steps,
  chanceMultiplier: lootConfig.stepChests.chanceMultipliers[i],
}));

export type ChestState = 'locked' | 'ready' | 'opened';

/** Local calendar day, e.g. "2026-10-24". */
export function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function recordSteps(save: SaveData, day: string, newSteps: number): SaveData {
  const count = save.steps.day === day ? save.steps.count : 0;
  return { ...save, steps: { day, count: count + newSteps } };
}

/** Raises today's count to an OS-reported total (iOS keeps step history). */
export function syncSteps(save: SaveData, day: string, total: number): SaveData {
  return { ...save, steps: { day, count: Math.max(stepsRecorded(save, day), total) } };
}

export function stepsRecorded(save: SaveData, day: string) {
  return save.steps.day === day ? save.steps.count : 0;
}

export function chestState(save: SaveData, chest: StepChest, steps: number, day: string): ChestState {
  if (save.chests.day === day && save.chests.opened.includes(chest.id)) return 'opened';
  return steps >= chest.steps ? 'ready' : 'locked';
}

/** Opens a chest once per day; the roll is seeded by day so it can't be rerolled. */
export function openChest(save: SaveData, chestId: string, steps: number, day: string, now: number): { save: SaveData; reward: Loot } {
  const chest = stepChests.find((c) => c.id === chestId);
  if (!chest) throw new Error(`Unknown chest ${chestId}`);
  if (chestState(save, chest, steps, day) !== 'ready') throw new Error(`The ${chest.steps} steps chest is not ready`);
  const reward = rollForSave(save, 'stepChest', createRng(`chest|${chest.id}|${day}`), { chanceMultiplier: chest.chanceMultiplier });
  const opened = save.chests.day === day ? save.chests.opened : [];
  return { save: grantLoot({ ...save, chests: { day, opened: [...opened, chest.id] } }, [], reward, now), reward };
}
