import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { canInfuse, canRecycle, infuse, recycle } from './infusion';

const withGear = (materials: Record<string, number> = { fireStone: 1 }): SaveData =>
  equip(
    {
      ...createInitialSave(),
      materials,
      gear: [
        { uid: 'g1', itemId: 'woodSword', durability: 15 },
        { uid: 'g2', itemId: 'steelArmour', durability: 40 },
      ],
    },
    'bram',
    'weapon',
    'g1',
  );

describe('infuse', () => {
  it('uses a stone to give a plain piece an element, at any tier', () => {
    const sword = infuse(withGear(), 'g1', 'fire');
    expect(sword.gear[0].element).toBe('fire');
    expect(sword.materials).toEqual({});
    expect(infuse(withGear({ waterStone: 1 }), 'g2', 'water').gear[1].element).toBe('water');
  });

  it('needs a stone of that element', () => {
    expect(canInfuse(withGear({}), 'g1', 'fire')).toBe(false);
    expect(canInfuse(withGear({ fireShard: 9 }), 'g1', 'fire')).toBe(false);
    expect(() => infuse(withGear({}), 'g1', 'fire')).toThrow();
  });

  it('only works on pieces that were never infused', () => {
    const once = infuse(withGear({ fireStone: 2 }), 'g1', 'fire');
    expect(canInfuse(once, 'g1', 'fire')).toBe(false);
    expect(() => infuse(once, 'g1', 'fire')).toThrow();
  });

  it('waits while the piece is away on an expedition', () => {
    const away: SaveData = {
      ...withGear(),
      expeditions: [{ id: 'x', dungeonId: 'ratCellar', heroIds: ['bram'], startedAt: 0, endsAt: 1, seed: 's', notificationId: null }],
    };
    expect(canInfuse(away, 'g1', 'fire')).toBe(false);
  });
});

describe('recycle', () => {
  it('destroys an infused piece, unequips it and gives one shard back', () => {
    const infused = infuse(withGear(), 'g1', 'fire');
    const recycled = recycle(infused, 'g1');
    expect(recycled.gear.map((g) => g.uid)).toEqual(['g2']);
    expect(recycled.heroes.find((h) => h.id === 'bram')!.equipment.weapon).toBeNull();
    expect(recycled.materials).toEqual({ fireShard: 1 });
  });

  it('turns the tenth shard into a stone', () => {
    const infused = { ...infuse(withGear(), 'g1', 'fire'), materials: { fireShard: 9 } };
    expect(recycle(infused, 'g1').materials).toEqual({ fireStone: 1 });
  });

  it('refuses plain pieces', () => {
    expect(canRecycle(withGear(), 'g1')).toBe(false);
    expect(() => recycle(withGear(), 'g1')).toThrow();
  });
});
