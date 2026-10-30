import { recipes } from '@/content/recipes';

import type { SaveData } from '../save';

/** Every id a part recipe waits on: monster parts and the gems of two charms. */
const unlockIds = new Set(recipes.flatMap((recipe) => recipe.unlockedBy ?? []));

/**
 * Notes the parts (and gems) among `ids` as seen, then unlocks every part
 * recipe whose `unlockedBy` have all been seen.
 */
export function seeParts(save: SaveData, ids: string[]): SaveData {
  const fresh = ids.filter((id) => unlockIds.has(id) && !save.seenParts.includes(id));
  if (fresh.length === 0) return save;
  const seenParts = [...save.seenParts, ...new Set(fresh)];
  const unlocked = recipes
    .filter((recipe) => recipe.unlockedBy?.every((id) => seenParts.includes(id)) && !save.partRecipes.includes(recipe.id))
    .map((recipe) => recipe.id);
  return { ...save, seenParts, partRecipes: [...save.partRecipes, ...unlocked] };
}

/** The part recipes `after` knows that `before` didn't, for the "New recipe" line. */
export const newPartRecipes = (before: SaveData, after: SaveData): string[] =>
  after.partRecipes.filter((id) => !before.partRecipes.includes(id));

/** Unlocks every part recipe and sees every part (debug). */
export function unlockAllPartRecipes(save: SaveData): SaveData {
  return seeParts(save, [...unlockIds]);
}
