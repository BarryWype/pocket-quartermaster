import { createInitialSave, type SaveData } from '../save';
import type { GearInstance } from '../types';
import { canReroll, reroll, rerollCost } from './reroll';

const piece = (uid: string, itemId: string, extra: Partial<GearInstance> = {}): GearInstance => ({
  uid,
  itemId,
  rarity: 'uncommon',
  roll: 8,
  affixes: [{ id: 'hunter', value: 20 }],
  rerolls: 0,
  ...extra,
});

const holding = (gear: GearInstance[], materials: Record<string, number> = { wood: 10 }, gold = 500): SaveData => ({
  ...createInitialSave(),
  materials,
  gold,
  gear,
});

describe('rerollCost', () => {
  it('is the tier material and gold, both grown by every reroll so far', () => {
    const tier1 = piece('g1', 'sword1');
    const growth = [0, 1, 2, 3].map((rerolls) => rerollCost({ ...tier1, rerolls }));
    expect(growth).toEqual([
      { materials: [{ materialId: 'wood', amount: 3 }], gold: 25 },
      { materials: [{ materialId: 'wood', amount: 5 }], gold: 38 },
      { materials: [{ materialId: 'wood', amount: 7 }], gold: 56 },
      { materials: [{ materialId: 'wood', amount: 11 }], gold: 84 },
    ]);

    const tier4 = piece('g1', 'sword4');
    expect(rerollCost({ ...tier4, rerolls: 2 })).toEqual({
      materials: [{ materialId: 'iron', amount: 7 }],
      gold: 225,
    });
  });

  it('uses a trinket tier too', () => {
    const trinket = piece('g1', 'hawkEyeRing1');
    expect(rerollCost(trinket)).toEqual({ materials: [{ materialId: 'wood', amount: 3 }], gold: 25 });
  });
});

describe('canReroll', () => {
  it('needs an Uncommon-or-better piece', () => {
    expect(canReroll(holding([piece('g1', 'sword1')]), 'g1')).toBe(true);
    expect(canReroll(holding([{ ...piece('g1', 'sword1'), rarity: 'common', affixes: [] }]), 'g1')).toBe(false);
    expect(canReroll(holding([piece('g1', 'sword1')], { stone: 10 }), 'g1')).toBe(false);
    expect(canReroll(holding([piece('g1', 'sword1')], { wood: 1 }), 'g1')).toBe(false);
    expect(canReroll(holding([piece('g1', 'sword1')], { wood: 10 }, 0), 'g1')).toBe(false);
    expect(canReroll(holding([]), 'g1')).toBe(false);
  });
});

describe('reroll', () => {
  it('replaces all affixes deterministically, keeping stats, roll, unique and relic, and counts the reroll', () => {
    const relic = piece('g1', 'sword4', {
      rarity: 'legendary',
      roll: 15,
      affixes: [
        { id: 'hunter', value: 20 },
        { id: 'veteran', value: 20 },
        { id: 'foragers', value: 10 },
      ],
      unique: 'barrowKingsBlade',
      relicId: 'poachersLongbow',
    });
    const save = holding([relic], { iron: 10 });
    const first = reroll(save, 'g1');
    const again = reroll(save, 'g1');
    const pieceAfter = first.gear[0];
    expect(again).toEqual(first);
    expect(pieceAfter.roll).toBe(15);
    expect(pieceAfter.unique).toBe('barrowKingsBlade');
    expect(pieceAfter.relicId).toBe('poachersLongbow');
    expect(pieceAfter.rerolls).toBe(1);
    expect(pieceAfter.affixes).toHaveLength(3);
    expect(again.gear[0].affixes).toEqual(pieceAfter.affixes);
  });

  it('spends the grown cost on the way', () => {
    let save = holding([piece('g1', 'sword1')], { ...createInitialSave().materials, wood: 30 });
    for (const spent of [
      { wood: 27, gold: 475 },
      { wood: 22, gold: 437 },
    ]) {
      save = reroll(save, 'g1');
      expect(save.materials.wood).toBe(spent.wood);
      expect(save.gold).toBe(spent.gold);
    }
  });

  it('refuses a Common piece', () => {
    const save = holding([{ ...piece('g1', 'sword1'), rarity: 'common', affixes: [] }]);
    expect(() => reroll(save, 'g1')).toThrow();
  });
});
