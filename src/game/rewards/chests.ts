import { chests as defaultChests } from '@/content/chests';
import { recipes } from '@/content/recipes';

import { unlockRecipe } from '../crafting/crafting';
import { createRng } from '../generation/rng';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { ChestDef, MaterialStack } from '../types';
import { rollLoot } from './loot';

export type ChestState = 'locked' | 'ready' | 'opened';

export type ChestReward = {
  gold: number;
  materials: MaterialStack[];
  recipeId: string | null;
};

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

export function chestState(save: SaveData, chest: ChestDef, steps: number, day: string): ChestState {
  if (save.chests.day === day && save.chests.opened.includes(chest.id)) return 'opened';
  return steps >= chest.steps ? 'ready' : 'locked';
}

/** Opens a chest once per day; the reward is seeded by day so it can't be rerolled. */
export function openChest(
  save: SaveData,
  chestId: string,
  steps: number,
  day: string,
  chests: ChestDef[] = defaultChests,
): { save: SaveData; reward: ChestReward } {
  const chest = chests.find((c) => c.id === chestId);
  if (!chest) throw new Error(`Unknown chest ${chestId}`);
  if (chestState(save, chest, steps, day) !== 'ready') throw new Error(`${chest.name} is not ready`);

  const rng = createRng(`chest|${chest.id}|${day}`);
  const gold = rng.int(chest.gold[0], chest.gold[1]);
  const materials = rollLoot(rng, chest.loot);
  const unknown = recipes.filter((r) => !save.knownRecipes.includes(r.id));
  const recipeId =
    rng.chance(chest.recipeChance) && unknown.length > 0 ? unknown[rng.int(0, unknown.length - 1)].id : null;

  const opened = save.chests.day === day ? save.chests.opened : [];
  let next: SaveData = {
    ...save,
    gold: save.gold + gold,
    materials: addMaterials(save.materials, materials),
    chests: { day, opened: [...opened, chest.id] },
  };
  if (recipeId) next = unlockRecipe(next, recipeId);
  return { save: next, reward: { gold, materials, recipeId } };
}
