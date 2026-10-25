import { createInitialSave, type SaveData } from '../save';
import { addXp, equip, heroStats, unequip } from './team';

function saveWithGear(): SaveData {
  return {
    ...createInitialSave(),
    gear: [
      { uid: 'g1', itemId: 'woodSword', durability: 15 },
      { uid: 'g2', itemId: 'woodWand', durability: 15 },
      { uid: 'g3', itemId: 'woodArmour', durability: 15 },
    ],
    consumables: { healingPotion: 1 },
  };
}

const hero = (save: SaveData, id: string) => save.heroes.find((h) => h.id === id)!;

describe('heroStats', () => {
  it('starts from class base stats', () => {
    const save = createInitialSave();
    expect(heroStats(save, hero(save, 'bram'))).toEqual({ attack: 4, defense: 3, magic: 0, hp: 30 });
  });

  it('adds gear stats, boosted by class affinity', () => {
    const save = equip(equip(saveWithGear(), 'bram', 'weapon', 'g1'), 'mira', 'weapon', 'g2');
    expect(heroStats(save, hero(save, 'bram')).attack).toBe(4 + 6 * 1.5);
    expect(heroStats(save, hero(save, 'mira')).magic).toBe(6 + 6 * 1.5);
  });

  it('gives no affinity bonus to other classes', () => {
    const save = equip(saveWithGear(), 'lyra', 'weapon', 'g2');
    expect(heroStats(save, hero(save, 'lyra')).magic).toBe(0 + 6);
  });

  it('grows with level', () => {
    const save = createInitialSave();
    const levelThree = { ...hero(save, 'bram'), level: 3 };
    expect(heroStats(save, levelThree).hp).toBe(30 + 3 * 2);
  });
});

describe('equip', () => {
  it('moves gear from one hero to another', () => {
    const save = equip(equip(saveWithGear(), 'bram', 'weapon', 'g1'), 'lyra', 'weapon', 'g1');
    expect(hero(save, 'bram').equipment.weapon).toBeNull();
    expect(hero(save, 'lyra').equipment.weapon).toBe('g1');
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
    const save: SaveData = {
      ...saveWithGear(),
      expeditions: [
        { id: 'e1', dungeonId: 'goblinWarren', heroIds: ['bram'], startedAt: 0, endsAt: 1, seed: 's', notificationId: null },
      ],
    };
    expect(() => equip(save, 'bram', 'weapon', 'g1')).toThrow();
    expect(() => unequip(save, 'bram', 'weapon')).toThrow();
    expect(() => equip(save, 'lyra', 'weapon', 'g1')).not.toThrow();
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
