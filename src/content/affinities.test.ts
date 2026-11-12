import { classAffinities, GEAR_SLOTS } from '@/content/equipment';

import type { ArmourType, GearType, HeroClassId, WeaponType } from '@/game/types';

const WEAPON_TYPES = (Object.keys(GEAR_SLOTS) as GearType[]).filter((type) => GEAR_SLOTS[type] === 'weapon') as WeaponType[];
const ARMOUR_TYPES = (Object.keys(GEAR_SLOTS) as GearType[]).filter((type) => GEAR_SLOTS[type] === 'armor') as ArmourType[];

/** Favoured weapon/armour counts per class before the new weapon types were favoured. */
const BEFORE_COUNTS: Record<HeroClassId, { weapons: number; armour: number }> = {
  warrior: { weapons: 3, armour: 2 },
  barbarian: { weapons: 3, armour: 2 },
  paladin: { weapons: 3, armour: 2 },
  ranger: { weapons: 3, armour: 1 },
  thief: { weapons: 3, armour: 1 },
  fireMage: { weapons: 2, armour: 1 },
  frostMage: { weapons: 2, armour: 2 },
  sorcerer: { weapons: 2, armour: 1 },
  cleric: { weapons: 2, armour: 1 },
  druid: { weapons: 2, armour: 2 },
  troubadour: { weapons: 2, armour: 1 },
  scholar: { weapons: 2, armour: 1 },
  exorcist: { weapons: 2, armour: 1 },
  duelist: { weapons: 3, armour: 1 },
  smuggler: { weapons: 2, armour: 1 },
  diplomat: { weapons: 2, armour: 2 },
  necromancer: { weapons: 3, armour: 1 },
  beastmaster: { weapons: 3, armour: 1 },
  engineer: { weapons: 3, armour: 2 },
  alchemist: { weapons: 2, armour: 2 },
  porter: { weapons: 3, armour: 1 },
  scout: { weapons: 3, armour: 1 },
  curseBreaker: { weapons: 3, armour: 2 },
  cook: { weapons: 3, armour: 2 },
  // The Monk's weapon of choice is knuckles (spear only usable); a Gambler who rolls Magic takes a wand.
  monk: { weapons: 1, armour: 2 },
  gambler: { weapons: 3, armour: 1 },
};

const favouredCount = (classId: HeroClassId, types: (WeaponType | ArmourType)[]) =>
  types.filter((type) => classAffinities[classId][type] === 'favoured').length;

describe('class affinities', () => {
  test('every class keeps its favoured weapon and armour counts', () => {
    for (const [classId, before] of Object.entries(BEFORE_COUNTS) as [HeroClassId, { weapons: number; armour: number }][]) {
      expect({ class: classId, weapons: favouredCount(classId, WEAPON_TYPES), armour: favouredCount(classId, ARMOUR_TYPES) })
        .toEqual({ class: classId, weapons: before.weapons, armour: before.armour });
    }
  });

  test('every weapon type is favoured by at least two classes', () => {
    for (const type of WEAPON_TYPES) {
      const classes = (Object.keys(classAffinities) as HeroClassId[]).filter((classId) => classAffinities[classId][type] === 'favoured');
      expect({ weapon: type, favouredBy: classes.length, ok: classes.length >= 2 }).toEqual({ weapon: type, favouredBy: classes.length, ok: true });
    }
  });
});
