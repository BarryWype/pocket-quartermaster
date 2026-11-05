import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { canInfuse, infuse } from './infusion';

const withGear = (materials: Record<string, number> = { fireStone: 1 }): SaveData =>
  equip(
    {
      ...createInitialSave(),
      materials,
      gear: [
        { uid: 'g1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
        { uid: 'g2', itemId: 'mail5', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      ],
    },
    'bram',
    'weapon',
    'g1',
  );

describe('infuse', () => {
  it('makes a Common piece Uncommon with the stone affix of its slot, at any tier', () => {
    const sword = infuse(withGear(), 'g1', 'fire');
    expect(sword.gear[0].rarity).toBe('uncommon');
    expect(sword.gear[0].affixes).toEqual([{ id: 'infusedFire', value: 0 }]);
    expect(sword.materials).toEqual({});
    const mail = infuse(withGear({ waterStone: 1 }), 'g2', 'water').gear[1];
    expect(mail.affixes.map((affix) => affix.id)).toEqual(['wardingWater']);
    expect(mail.affixes[0].value).toBeGreaterThanOrEqual(15);
  });

  it('needs a stone of that element', () => {
    expect(canInfuse(withGear({}), 'g1', 'fire')).toBe(false);
    expect(canInfuse(withGear({ fireShard: 9 }), 'g1', 'fire')).toBe(false);
    expect(() => infuse(withGear({}), 'g1', 'fire')).toThrow();
  });

  it('replaces one affix of a piece that has some, keeping its rarity', () => {
    const save = withGear({ waterStone: 1 });
    const rare = { ...save, gear: [{ ...save.gear[0], rarity: 'rare' as const, affixes: [{ id: 'hunter', value: 20 }, { id: 'veteran', value: 15 }] }, save.gear[1]] };
    const after = infuse(rare, 'g1', 'water').gear[0];
    expect(after.rarity).toBe('rare');
    expect(after.affixes).toHaveLength(2);
    expect(after.affixes.map((affix) => affix.id)).toContain('infusedWater');
  });

  it('waits while the piece is away on an expedition', () => {
    const away: SaveData = {
      ...withGear(),
      expeditions: [{ id: 'x', dungeonId: 'ratCellar', heroIds: ['bram'], startedAt: 0, endsAt: 1, seed: 's', notificationId: null }],
    };
    expect(canInfuse(away, 'g1', 'fire')).toBe(false);
  });
});
