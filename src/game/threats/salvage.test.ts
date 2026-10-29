import { recipeById } from '@/content/lookup';
import { threatRules } from '@/content/threats';

import { salvage } from './salvage';

describe('salvage', () => {
  it('returns half of each recipe input, the main one at least 1', () => {
    expect(salvage('roguesRoll')).toEqual({ materials: [{ materialId: 'bone', amount: 1 }], gold: 0 });
    expect(salvage('explorersKit')).toEqual({
      materials: [
        { materialId: 'stone', amount: 1 },
        { materialId: 'wood', amount: 1 },
        { materialId: 'hide', amount: 1 },
      ],
      gold: 0,
    });
    expect(salvage('emberWardSalve')).toEqual({
      materials: [
        { materialId: 'fireShard', amount: 1 },
        { materialId: 'herb', amount: 1 },
      ],
      gold: 0,
    });
    expect(salvage('healingPotion')).toEqual({ materials: [{ materialId: 'herb', amount: 1 }], gold: 0 });
  });

  it('pays a little gold without a recipe', () => {
    expect(salvage('shinyPebble')).toEqual({ materials: [], gold: threatRules.salvageGold });
  });

  it('salvages every kit from its own recipe', () => {
    for (const itemId of [
      'roguesRoll',
      'huntersPack',
      'emberWardSalve',
      'tideWardSalve',
      'stormWardSalve',
      'stoneWardSalve',
      'thornWardSalve',
      'explorersKit',
      'healersSatchel',
      'giftBasket',
      'lantern',
      'holyRelics',
      'scholarsSatchel',
    ]) {
      expect(recipeById[itemId]).toBeDefined();
      const { materials, gold } = salvage(itemId);
      expect(materials.length).toBeGreaterThan(0);
      expect(gold).toBe(0);
    }
  });
});
