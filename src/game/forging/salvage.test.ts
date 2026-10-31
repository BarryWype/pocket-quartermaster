import { salvageRules } from '@/content/forging';

import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { GearInstance } from '../types';
import { salvageDialog } from './salvage';

const piece = (itemId: string, quality: GearInstance['quality'] = 'normal', extra: Partial<GearInstance> = {}): GearInstance => ({
  uid: 'g1',
  itemId,
  quality,
  ...extra,
});

describe('salvage dialog', () => {
  it('shows a plain unequipped piece with no warnings and its recipe share', () => {
    const save = createInitialSave();
    expect(salvageDialog(save, piece('sword1'))).toEqual({
      quality: 'normal',
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

  it('warns about a piece a hero is wearing', () => {
    const worn = equip({ ...createInitialSave(), gear: [piece('sword1')] }, 'bram', 'weapon', 'g1');
    expect(salvageDialog(worn, piece('sword1')).warnings).toEqual(['equipped']);
  });

  it('warns about Rare and Legendary quality', () => {
    const save = createInitialSave();
    expect(salvageDialog(save, piece('mail2', 'rare')).warnings).toEqual(['rareOrBetter']);
    expect(salvageDialog(save, piece('sword4', 'legendary')).warnings).toEqual(['rareOrBetter']);
  });

  it('warns about restored relics and forged components', () => {
    const save = createInitialSave();
    expect(salvageDialog(save, piece('sword1', 'normal', { relicId: 'poachersLongbow' })).warnings).toEqual(['relic']);
    expect(salvageDialog(save, piece('mail2', 'normal', { component: 'captainsSpurs' })).warnings).toEqual(['component']);
  });

  it('warns about infused pieces and counts their shards in the returns', () => {
    const dialog = salvageDialog(createInitialSave(), piece('sword1', 'normal', { element: 'fire' }));
    expect(dialog.warnings).toEqual(['infused']);
    expect(dialog.returns.materials).toEqual([
      { materialId: 'wood', amount: 1 },
      { materialId: 'fireShard', amount: salvageRules.infusedShards },
    ]);
  });

  it('gives gold instead of materials for a trinket without a recipe', () => {
    const dialog = salvageDialog(createInitialSave(), piece('hawkEyeRing1'));
    expect(dialog.returns.materials).toEqual([]);
    expect(dialog.returns.gold).toBeGreaterThan(0);
  });

  it('can combine several warnings on one piece', () => {
    const dialog = salvageDialog(createInitialSave(), piece('sword4', 'rare', { component: 'dragonClaw', element: 'water' }));
    expect(dialog.warnings).toEqual(['rareOrBetter', 'component', 'infused']);
  });
});
