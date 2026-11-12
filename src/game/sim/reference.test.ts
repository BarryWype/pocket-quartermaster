import { items } from '@/content/items';
import { classAffinities } from '@/content/equipment';
import type { GearDef, HeroClassId, WeaponType } from '@/game/types';

import { weaponTypeFor } from '../equipment/weaponOfChoice';
import { naturalGear, referenceSave, rosterSave, weaponFor } from './reference';
import { expectedLevels } from './config';

// The reference teams the difficulty odds are measured against (see difficultyOdds.ts).

/** The weapon types the last content change added. */
const NEW_WEAPON_TYPES: WeaponType[] = ['crossbow', 'throwing', 'totem', 'runestone', 'flasks'];

describe('weaponFor', () => {
  it('picks a weapon type the class favours, for the classes the affinity change touched', () => {
    for (const classId of ['scholar', 'smuggler', 'druid'] as HeroClassId[]) {
      for (let tier = 1; tier <= 5; tier++) {
        const weapon = weaponFor(classId, tier)!;
        expect(classAffinities[classId][weapon.gearType as WeaponType]).toBe('favoured');
      }
    }
    expect(weaponFor('scholar', 1)!.gearType).toBe('runestone');
    expect(weaponFor('smuggler', 1)!.gearType).toBe('crossbow');
  });

  it('uses at least one of the new weapon types across all classes', () => {
    const classes = Object.keys(classAffinities) as HeroClassId[];
    const picked = new Set(classes.map((classId) => weaponFor(classId, 3)!.gearType as WeaponType));
    expect(NEW_WEAPON_TYPES.some((type) => picked.has(type))).toBe(true);
  });
});

describe('referenceSave', () => {
  it('starts a tier at the previous tier band top, in Common gear of the tier below', () => {
    const save = referenceSave(3, 'start', 3);
    expect(save.heroes.map((h) => h.level)).toEqual([expectedLevels[1], expectedLevels[1], expectedLevels[1]]);
    const gear = save.gear.map((g) => ({ item: items.find((i) => i.id === g.itemId) as GearDef, rarity: g.rarity }));
    expect(gear.every((g) => g.item.tier === 2)).toBe(true);
    expect(gear.every((g) => g.rarity === 'common')).toBe(true);
    expect(save.heroes.every((h) => h.equipment.armor)).toBe(true);
  });

  it('ends a tier at the band top, in Uncommon gear of the tier', () => {
    const save = referenceSave(2, 'end', 3);
    expect(save.heroes.every((h) => h.level === expectedLevels[1])).toBe(true);
    const gear = save.gear.map((g) => ({ item: items.find((i) => i.id === g.itemId) as GearDef, rarity: g.rarity }));
    expect(gear.every((g) => g.item.tier === 2)).toBe(true);
    expect(gear.every((g) => g.rarity === 'uncommon')).toBe(true);
    expect(save.heroes.every((h) => h.equipment.weapon && h.equipment.armor)).toBe(true);
  });

  it('carries only a weapon at the start of tier 1', () => {
    const save = referenceSave(1, 'start', 3);
    expect(save.heroes.every((h) => h.level === 1)).toBe(true);
    expect(save.heroes.every((h) => h.equipment.weapon && !h.equipment.armor)).toBe(true);
  });

  it('equips a healing potion on every hero, three stocked and carried', () => {
    const save = referenceSave(4, 'end', 3);
    expect(save.consumables.healingPotion).toBe(0);
    expect(save.heroes.every((h) => h.equipment.consumable === 'healingPotion')).toBe(true);
  });

  it('unlocks the tier: every lower tier cleared, party size honoured', () => {
    const save = referenceSave(5, 'start', 2);
    expect(save.heroes).toHaveLength(2);
    expect(save.clearedDungeons.filter((id) => id === 'giantsHall').length).toBe(1);
  });
});

describe('rosterSave', () => {
  it('ends a tier with six heroes at the band top, each in Uncommon gear of the tier in every slot it fills, a trinket included', () => {
    const save = rosterSave(3, 'end');
    expect(save.heroes).toHaveLength(6);
    expect(save.heroes.every((h) => h.level === expectedLevels[2])).toBe(true);
    for (const hero of save.heroes) {
      expect(hero.equipment.weapon && hero.equipment.armor && hero.equipment.helmet && hero.equipment.trinket).toBeTruthy();
      for (const uid of Object.values(hero.equipment).filter(Boolean)) {
        const piece = save.gear.find((g) => g.uid === uid);
        if (!piece) continue;
        expect(piece.rarity).toBe('uncommon');
        expect((items.find((i) => i.id === piece.itemId) as GearDef).tier).toBe(3);
      }
    }
  });

  it("starts a tier with the previous tier's end gear, the boss's piece and the foothold weapon of this tier, this tier unlocked", () => {
    const start = rosterSave(4, 'start');
    const end = rosterSave(3, 'end');
    expect(start.heroes.map((h) => h.level)).toEqual(end.heroes.map((h) => h.level));
    expect(start.gear.filter((g) => g.uid !== 'boss:weapon' && g.uid !== 'foothold:weapon').map((g) => g.itemId)).toEqual(end.gear.map((g) => g.itemId));
    // The tier 3 boss's piece of tier 4: the warrior's weapon of choice.
    expect(start.heroes[0].equipment.weapon).toBe('boss:weapon');
    expect(start.gear.find((g) => g.uid === 'boss:weapon')!.itemId).toBe('sword4');
    // The foothold: the ranger's weapon of choice, forged Common.
    const foothold = start.gear.find((g) => g.uid === 'foothold:weapon')!;
    expect(start.heroes.find((h) => h.classId === 'ranger')!.equipment.weapon).toBe('foothold:weapon');
    expect(foothold).toMatchObject({ itemId: `${weaponTypeFor('ranger')}4`, rarity: 'common' });
    expect(start.clearedDungeons).toContain('drownedCrypt');
  });

  it('starts tier 1 like the reference team: the trio with a weapon each', () => {
    const roster = rosterSave(1, 'start');
    const reference = referenceSave(1, 'start', 3);
    expect(roster.heroes).toEqual(reference.heroes);
    expect(roster.gear).toEqual(reference.gear);
  });
});

describe('naturalGear', () => {
  it("swaps the worn weapon, armour and helmet for the class's first favoured types at the worn tier and rarity", () => {
    const save = rosterSave(3, 'end');
    const ids = save.heroes.map((h) => h.id);
    const dressed = { ...save, heroes: save.heroes.map((h, i) => (i === 0 ? { ...h, equipment: { ...h.equipment, helmet: 'helmet:r5' } } : h)) };
    const regeared = naturalGear(dressed, ids);
    const warrior = regeared.heroes[0];
    const piece = (uid: string | null) => regeared.gear.find((g) => g.uid === uid)!;
    expect(piece(warrior.equipment.weapon).itemId).toBe('sword3');
    expect(piece(warrior.equipment.armor).itemId).toBe('plate3');
    expect(piece(warrior.equipment.helmet).itemId).toBe('greatHelm3');
    expect(piece(warrior.equipment.helmet).rarity).toBe('uncommon');
    expect(warrior.equipment.trinket).toBe(save.heroes[0].equipment.trinket);
  });
});
