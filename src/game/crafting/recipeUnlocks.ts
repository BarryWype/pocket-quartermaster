import { gearRecipes } from '@/content/equipment';

import type { GearType } from '../types';

/** Every armour and helmet type at tier 1: few types, so all of them are known from the start. */
export const STARTING_ARMOUR = ['plate1', 'mail1', 'leather1', 'robes1', 'greatHelm1', 'sallet1', 'hood1', 'plagueMask1', 'runeCirclet1'];

/**
 * Known from the start: the sword the starting heroes favour, one weapon or
 * off-hand for every threat family most classes can use (doc/design/families/,
 * "Answering threats early"): spear Wild and Watch, lute Cunning, flasks Venom,
 * focus Warding, knuckles Breaker; and every armour and helmet type at tier 1,
 * which together carry all seven threat families.
 */
export const startingRecipes = ['sword1', 'spear1', 'lute1', 'flasks1', 'focus1', 'knuckles1', ...STARTING_ARMOUR];

/** Every gear type's recipe of `tier`; what a pickaxe of the tier before taught in old saves. */
export function tierRecipes(tier: number): string[] {
  const types = Object.keys(gearRecipes) as GearType[];
  return types.filter((type) => gearRecipes[type][tier - 1]).map((type) => `${type}${tier}`);
}
