import { gearRecipes } from '@/content/equipment';

import type { GearType } from '../types';

/**
 * Known from the start: the sword and mail the starting heroes favour, and one
 * piece for every threat family most classes can use (doc/design/families/,
 * "Answering threats early"): mail Faith, spear Wild and Watch, lute Cunning,
 * flasks Venom, focus Warding, knuckles Breaker.
 */
export const startingRecipes = ['sword1', 'mail1', 'spear1', 'lute1', 'flasks1', 'focus1', 'knuckles1'];

/** Every gear type's recipe of `tier`; what a pickaxe of the tier before taught in old saves. */
export function tierRecipes(tier: number): string[] {
  const types = Object.keys(gearRecipes) as GearType[];
  return types.filter((type) => gearRecipes[type][tier - 1]).map((type) => `${type}${tier}`);
}
