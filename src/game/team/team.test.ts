import { newHero } from '@/content/heroes';
import { itemById } from '@/content/lookup';

import { createInitialSave, type SaveData } from '../save';
import { addXp, canDismiss, canWield, dismissHero, equip, heroStats, rosterFull, unequip } from './team';

function saveWithGear(): SaveData {
  return {
    ...createInitialSave(),
    gear: [
      { uid: 'g1', itemId: 'woodSword', quality: 'normal' },
      { uid: 'g2', itemId: 'woodWand', quality: 'normal' },
      { uid: 'g3', itemId: 'woodArmour', quality: 'normal' },
    ],
    consumables: { healingPotion: 1 },
  };
}

const hero = (save: SaveData, id: string) => save.heroes.find((h) => h.id === id)!;
const away = (save: SaveData, heroId: string): SaveData => ({
  ...save,
  expeditions: [{ id: 'e1', dungeonId: 'goblinWarren', heroIds: [heroId], startedAt: 0, endsAt: 1, seed: 's', notificationId: null }],
});

describe('heroStats', () => {
  it('starts from class base stats, with the trait on top (Bram is tough: +15% HP)', () => {
    const save = createInitialSave();
    expect(heroStats(save, hero(save, 'bram'))).toEqual({ attack: 4, defense: 3, magic: 0, hp: Math.round(30 * 1.15) });
    expect(heroStats(save, hero(save, 'lyra'))).toEqual({ attack: 5, defense: 1, magic: 0, hp: 24 });
  });

  it('adds gear stats, boosted by class affinity', () => {
    const save = equip(equip(saveWithGear(), 'bram', 'weapon', 'g1'), 'mira', 'weapon', 'g2');
    expect(heroStats(save, hero(save, 'bram')).attack).toBe(4 + 6 * 1.5);
    expect(heroStats(save, hero(save, 'mira')).magic).toBe(6 + 6 * 1.5);
  });

  it('gives support classes a smaller affinity', () => {
    const paladin = newHero('p', 'Pal', 'paladin', 'greedy');
    const save = equip({ ...saveWithGear(), heroes: [...createInitialSave().heroes, paladin] }, 'p', 'weapon', 'g1');
    expect(heroStats(save, hero(save, 'p')).attack).toBe(Math.round(3 + 6 * 1.25));
  });

  it('grows with level', () => {
    const save = createInitialSave();
    const levelThree = { ...hero(save, 'lyra'), level: 3 };
    expect(heroStats(save, levelThree).hp).toBe(24 + 2 * 2.5);
  });
});

describe('class-locked weapons', () => {
  it('only lets a class wield its own weapon types; armour is open to all', () => {
    const save = createInitialSave();
    expect(canWield(hero(save, 'lyra'), itemById.woodBow)).toBe(true);
    expect(canWield(hero(save, 'lyra'), itemById.woodSword)).toBe(false);
    expect(canWield(hero(save, 'lyra'), itemById.woodArmour)).toBe(true);
    expect(canWield(newHero('p', 'Pal', 'paladin', 'tough'), itemById.copperMace)).toBe(true);
    expect(() => equip(saveWithGear(), 'lyra', 'weapon', 'g1')).toThrow(/cannot use/);
  });
});

describe('equip', () => {
  it('moves gear from one hero to another', () => {
    const save = equip(equip(saveWithGear(), 'bram', 'armor', 'g3'), 'lyra', 'armor', 'g3');
    expect(hero(save, 'bram').equipment.armor).toBeNull();
    expect(hero(save, 'lyra').equipment.armor).toBe('g3');
  });

  it('rejects gear in the wrong slot', () => {
    expect(() => equip(saveWithGear(), 'bram', 'armor', 'g1')).toThrow();
  });

  it('takes consumables out of the stock and gives them back on unequip', () => {
    const equipped = equip(saveWithGear(), 'bram', 'consumable', 'healingPotion');
    expect(equipped.consumables.healingPotion).toBe(0);
    expect(() => equip(equipped, 'lyra', 'consumable', 'healingPotion')).toThrow();
    expect(unequip(equipped, 'bram', 'consumable').consumables.healingPotion).toBe(1);
  });

  it('blocks changes while a hero is on an expedition', () => {
    const save = away(saveWithGear(), 'bram');
    expect(() => equip(save, 'bram', 'weapon', 'g1')).toThrow();
    expect(() => unequip(save, 'bram', 'weapon')).toThrow();
    expect(() => equip(save, 'lyra', 'armor', 'g3')).not.toThrow();
  });
});

describe('roster', () => {
  it('dismisses a hero and returns their gear and consumable', () => {
    let save = equip(equip(saveWithGear(), 'bram', 'weapon', 'g1'), 'bram', 'consumable', 'healingPotion');
    save = dismissHero(save, 'bram');
    expect(save.heroes.map((h) => h.id)).toEqual(['lyra', 'mira']);
    expect(save.gear.map((g) => g.uid)).toContain('g1');
    expect(save.consumables.healingPotion).toBe(1);
  });

  it('refuses to dismiss a hero on an expedition, or the last one', () => {
    expect(canDismiss(away(createInitialSave(), 'bram'), 'bram')).toBe(false);
    expect(() => dismissHero(away(createInitialSave(), 'bram'), 'bram')).toThrow();
    const alone: SaveData = { ...createInitialSave(), heroes: [hero(createInitialSave(), 'mira')] };
    expect(canDismiss(alone, 'mira')).toBe(false);
  });

  it('is full at six heroes', () => {
    const six = Array.from({ length: 6 }, (_, i) => newHero(`h${i}`, 'X', 'warrior', 'tough'));
    expect(rosterFull(createInitialSave())).toBe(false);
    expect(rosterFull({ ...createInitialSave(), heroes: six })).toBe(true);
  });
});

describe('addXp', () => {
  it('levels up and carries over the remainder', () => {
    const save = createInitialSave();
    const leveled = addXp(hero(save, 'bram'), 250);
    expect(leveled.level).toBe(2);
    expect(leveled.xp).toBe(150);
    expect(addXp(hero(save, 'bram'), 300).level).toBe(3);
  });
});
