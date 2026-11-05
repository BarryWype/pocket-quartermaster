import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { GearInstance } from '../types';
import { salvageDialog, salvageReturns } from './salvage';

const piece = (itemId: string, rarity: GearInstance['rarity'] = 'common', extra: Partial<GearInstance> = {}): GearInstance => ({
  uid: 'g1',
  itemId,
  rarity,
  roll: 8,
  affixes: [],
  rerolls: 0,
  ...extra,
});

describe('salvage dialog', () => {
  it('shows a plain unequipped piece with no warnings and its recipe share', () => {
    const save = createInitialSave();
    expect(salvageDialog(save, piece('sword1'))).toEqual({
      rarity: 'common',
      returns: { materials: [{ materialId: 'wood', amount: 1 }], gold: 0 },
      warnings: [],
    });
  });

  it('applies the Guild Hall Salvage bonus to the recipe share', () => {
    const save: SaveData = { ...createInitialSave(), guild: { salvage: 2 } };
    expect(salvageDialog(save, piece('mail2', 'rare')).returns).toEqual({
      materials: [
        { materialId: 'bone', amount: 1 },
        { materialId: 'stone', amount: 3 },
      ],
      gold: 0,
    });
  });

  it("raises a Tinkered piece's recipe share by its own value, keeping the first input's floor", () => {
    expect(salvageReturns(piece('mail2', 'rare'))).toEqual([
      { materialId: 'bone', amount: 1 },
      { materialId: 'stone', amount: 2 },
    ]);
    // A 50% share raise: stone goes 2 → 3, bone stays at its floor of 1.
    expect(salvageReturns(piece('mail2', 'rare', { affixes: [{ id: 'tinkered', value: 50 }] }))).toEqual([
      { materialId: 'bone', amount: 1 },
      { materialId: 'stone', amount: 3 },
    ]);
  });

  it('warns about a piece a hero is wearing', () => {
    const worn = equip({ ...createInitialSave(), gear: [piece('sword1')] }, 'bram', 'weapon', 'g1');
    expect(salvageDialog(worn, piece('sword1')).warnings).toEqual(['equipped']);
  });

  it('warns about Rare and Legendary rarity', () => {
    const save = createInitialSave();
    expect(salvageDialog(save, piece('mail2', 'rare')).warnings).toEqual(['rareOrBetter']);
    expect(salvageDialog(save, piece('sword4', 'legendary')).warnings).toEqual(['rareOrBetter']);
  });

  it('warns about restored relics and pieces with affixes', () => {
    const save = createInitialSave();
    expect(salvageDialog(save, piece('sword1', 'common', { relicId: 'poachersLongbow' })).warnings).toEqual(['relic']);
    expect(salvageDialog(save, piece('mail2', 'uncommon', { affixes: [{ id: 'fleet', value: 3 }] })).warnings).toEqual(['affixes']);
  });

  it('gives gold instead of materials for a trinket without a recipe', () => {
    const dialog = salvageDialog(createInitialSave(), piece('hawkEyeRing1'));
    expect(dialog.returns.materials).toEqual([]);
    expect(dialog.returns.gold).toBeGreaterThan(0);
  });

  it('can combine several warnings on one piece', () => {
    const affixes = [{ id: 'cleaving', value: 0 }, { id: 'infusedWater', value: 0 }];
    const dialog = salvageDialog(createInitialSave(), piece('sword4', 'rare', { affixes }));
    expect(dialog.warnings).toEqual(['rareOrBetter', 'affixes']);
  });
});
