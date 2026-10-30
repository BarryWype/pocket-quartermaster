import { gearRecipes } from '@/content/equipment';

import type { GearType } from '../types';

/** Known from the start: a weapon and an armour the starting heroes favour. */
export const startingRecipes = ['sword1', 'mail1'];

/** Every gear type's recipe of `tier`; what a pickaxe of the tier before taught in old saves. */
export function tierRecipes(tier: number): string[] {
  const types = Object.keys(gearRecipes) as GearType[];
  return types.filter((type) => gearRecipes[type][tier - 1]).map((type) => `${type}${tier}`);
}

/** Old gear ids → the same type and tier under the new ids (`copperBow` → `bow3`). */
const LEGACY_SUFFIX: Record<string, GearType> = {
  Sword: 'sword',
  Bow: 'bow',
  Wand: 'wand',
  Armour: 'mail',
  Axe: 'axe',
  Mace: 'mace',
  Dagger: 'dagger',
  Staff: 'staff',
  Lute: 'lute',
  Instrument: 'lute',
};

const LEGACY_MATERIALS = ['wood', 'stone', 'copper', 'iron', 'steel'];

/** An old gear or recipe id's new id, or null when it maps to nothing. */
export function legacyRecipeId(oldId: string): string | null {
  const material = LEGACY_MATERIALS.find((m) => oldId.startsWith(m));
  const suffix = material ? oldId.slice(material.length) : null;
  if (!material || suffix === null || !(suffix in LEGACY_SUFFIX)) return null;
  const type = LEGACY_SUFFIX[suffix];
  return `${type}${LEGACY_MATERIALS.indexOf(material) + 1}`;
}
