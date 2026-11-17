import { newHero } from '@/content/heroes';

import { createInitialSave, type SaveData } from '../save';
import type { GearInstance, HeroState } from '../types';

import { slotProblem } from './slots';

const piece = (uid: string, itemId: string): GearInstance => ({ uid, itemId, rarity: 'common', roll: 8, affixes: [], rerolls: 0 });

const saveWith = (weaponItemId: string | null, offhandItemId: string): SaveData => ({
  ...createInitialSave(),
  gear: [piece('w1', weaponItemId ?? 'sword1'), piece('o1', offhandItemId)],
});

const wielding = (save: SaveData, hero: HeroState, weaponItemId: string | null): HeroState => ({
  ...hero,
  equipment: { ...hero.equipment, weapon: weaponItemId ? 'w1' : null },
});

const warrior = newHero('w', 'W', 'warrior', 'none');
const sorcerer = newHero('s', 'S', 'sorcerer', 'none');

const problemOf = (save: SaveData, hero: HeroState, weaponItemId: string | null, offhandItemId: string) =>
  slotProblem(save, wielding(save, hero, weaponItemId), 'offhand', piece('o1', offhandItemId));

describe('slotProblem off-hand pairing', () => {
  it('takes ammunition with a crossbow or a bow', () => {
    expect(problemOf(saveWith('crossbow1', 'quiver1'), warrior, 'crossbow1', 'quiver1')).toBeNull();
    expect(problemOf(saveWith('bow1', 'quiver1'), warrior, 'bow1', 'quiver1')).toBeNull();
  });

  it('refuses a shield with a crossbow and ammunition with a sword', () => {
    expect(problemOf(saveWith('crossbow1', 'shield1'), warrior, 'crossbow1', 'shield1')).toBe('rangedNeedsAmmo');
    expect(problemOf(saveWith('sword1', 'quiver1'), warrior, 'sword1', 'quiver1')).toBe('ammoNeedsBowOrCrossbow');
  });

  it('refuses any off-hand with a two-handed totem', () => {
    expect(problemOf(saveWith('totem1', 'shield1'), sorcerer, 'totem1', 'shield1')).toBe('twoHanded');
    expect(problemOf(saveWith('totem1', 'focus1'), sorcerer, 'totem1', 'focus1')).toBe('twoHanded');
  });

  it('takes a buckler or an off-hand blade with throwing weapons', () => {
    expect(problemOf(saveWith('throwing1', 'buckler1'), warrior, 'throwing1', 'buckler1')).toBeNull();
    expect(problemOf(saveWith('throwing1', 'offhandBlade1'), warrior, 'throwing1', 'offhandBlade1')).toBeNull();
  });

  it('takes a focus or a tome with a runestone', () => {
    expect(problemOf(saveWith('runestone1', 'focus1'), sorcerer, 'runestone1', 'focus1')).toBeNull();
    expect(problemOf(saveWith('runestone1', 'tome1'), sorcerer, 'runestone1', 'tome1')).toBeNull();
  });

  it('takes a focus with flasks only for a magic class, and a shield for anyone', () => {
    expect(problemOf(saveWith('flasks1', 'focus1'), sorcerer, 'flasks1', 'focus1')).toBeNull();
    expect(problemOf(saveWith('flasks1', 'focus1'), warrior, 'flasks1', 'focus1')).toBe('needsMagicWeapon');
    expect(problemOf(saveWith('flasks1', 'shield1'), warrior, 'flasks1', 'shield1')).toBeNull();
  });
});
