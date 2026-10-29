import { itemById } from '@/content/lookup';

import type { SaveData } from '../save';
import type { GearDef, GearInstance, HeroState } from '../types';

export type SlotProblem =
  /** A two-handed weapon takes the off-hand. */
  | 'twoHanded'
  | 'shieldNeedsOneHanded'
  | 'quiverBowOnly'
  /** A bow's off-hand can only be a quiver. */
  | 'bowQuiverOnly'
  | 'needsMagicWeapon';

const gearDefOf = (save: SaveData, gear: GearInstance): GearDef => itemById[gear.itemId] as GearDef;

/**
 * Why a piece cannot go into a hero's slot, or null when it can. Equipping a
 * two-handed weapon unequips the off-hand instead of failing; changing the
 * weapon unequips an off-hand that no longer fits (both in team.ts `equip`).
 */
export function slotProblem(
  save: SaveData,
  hero: HeroState,
  slot: 'offhand' | 'weapon' | 'armor' | 'trinket',
  gear: GearInstance,
): SlotProblem | null {
  if (slot !== 'offhand') return null;
  const item = gearDefOf(save, gear);
  const weaponUid = hero.equipment.weapon;
  const weapon = weaponUid ? save.gear.find((g) => g.uid === weaponUid) : undefined;
  const weaponItem = weapon ? gearDefOf(save, weapon) : null;
  const isBow = weaponItem?.gearType === 'bow';
  if (weaponItem?.twoHanded) return 'twoHanded';
  if (isBow) return item.gearType === 'quiver' ? null : 'bowQuiverOnly';
  switch (item.gearType) {
    case 'shield':
      return weaponItem && !weaponItem.twoHanded ? null : 'shieldNeedsOneHanded';
    case 'quiver':
      return isBow ? null : 'quiverBowOnly';
    case 'tome':
    case 'focus':
      return weaponItem?.damageStat === 'magic' ? null : 'needsMagicWeapon';
    default:
      return null;
  }
}
