import { gearRecipes } from '@/content/equipment';

import type { GearType } from '../types';

/** Known from the start: a weapon and an armour the starting heroes favour. */
export const startingRecipes = ['sword1', 'mail1'];

/** Every gear type's recipe of `tier`; what a pickaxe of the tier before taught in old saves. */
export function tierRecipes(tier: number): string[] {
  const types = Object.keys(gearRecipes) as GearType[];
  return types.filter((type) => gearRecipes[type][tier - 1]).map((type) => `${type}${tier}`);
}
