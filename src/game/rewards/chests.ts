import { lootConfig } from '@/content/loot/config';

import { createRng } from '../generation/rng';
import { guildBonus } from '../guild/guild';
import { rollForSave } from '../loot/context';
import { grantLoot } from '../loot/grant';
import { mergeLoot } from '../loot/roll';
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

/** Adds steps to the day's count and the lifetime total (walk quests read that). */
export function recordSteps(save: SaveData, day: string, newSteps: number): SaveData {
  const count = save.steps.day === day ? save.steps.count : 0;
  return { ...save, steps: { day, count: count + newSteps }, stepsTotal: save.stepsTotal + newSteps };
}

/** Raises today's count to an OS-reported total (iOS keeps step history). */
export function syncSteps(save: SaveData, day: string, total: number): SaveData {
  const recorded = stepsRecorded(save, day);
  return { ...save, steps: { day, count: Math.max(recorded, total) }, stepsTotal: save.stepsTotal + Math.max(0, total - recorded) };
}

export function stepsRecorded(save: SaveData, day: string) {
  return save.steps.day === day ? save.steps.count : 0;
}

export function chestState(save: SaveData, chest: StepChest, steps: number, day: string): ChestState {
  if (save.chests.day === day && save.chests.opened.includes(chest.id)) return 'opened';
  return steps >= chest.steps ? 'ready' : 'locked';
}

/** Opens a chest once per day; the roll is seeded by day so it can't be rerolled. The highest chest rolls once per Step chests rank, merged. */
export function openChest(save: SaveData, chestId: string, steps: number, day: string, now: number): { save: SaveData; reward: Loot } {
  const chest = stepChests.find((c) => c.id === chestId);
  if (!chest) throw new Error(`Unknown chest ${chestId}`);
  if (chestState(save, chest, steps, day) !== 'ready') throw new Error(`The ${chest.steps} steps chest is not ready`);
  const rolls = chest.steps === stepChests[stepChests.length - 1].steps ? 1 + guildBonus(save, 'stepChests') : 1;
  let reward = rollForSave(save, 'stepChest', createRng(`chest|${chest.id}|${day}`), { chanceMultiplier: chest.chanceMultiplier });
  for (let i = 1; i < rolls; i++) {
    reward = mergeLoot(reward, rollForSave(save, 'stepChest', createRng(`chest|${chest.id}|${day}|${i}`), { chanceMultiplier: chest.chanceMultiplier }));
  }
  const opened = save.chests.day === day ? save.chests.opened : [];
  return { save: grantLoot({ ...save, chests: { day, opened: [...opened, chest.id] } }, [], reward, now), reward };
}
