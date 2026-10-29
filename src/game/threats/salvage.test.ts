import { recipeById } from '@/content/lookup';
import { threatRules } from '@/content/threats';

import { salvage } from './salvage';

describe('salvage', () => {
  it('returns half of each recipe input, the main one at least 1', () => {
    expect(salvage('roguesRoll')).toEqual({ materials: [{ materialId: 'bone', amount: 1 }], gold: 0 });
    expect(salvage('explorersKit')).toEqual({
      materials: [
        { materialId: 'stone', amount: 1 },
        { materialId: 'hide', amount: 1 },
      ],
      gold: 0,
    });
    expect(salvage('emberWardSalve')).toEqual({ materials: [{ materialId: 'iron', amount: 1 }], gold: 0 });
    expect(salvage('healingPotion')).toEqual({ materials: [{ materialId: 'herb', amount: 1 }], gold: 0 });
  });

  it('breaks the stronger potions down to their tier’s main material', () => {
    expect(salvage('standardHealingPotion')).toEqual({ materials: [{ materialId: 'copper', amount: 1 }], gold: 0 });
    expect(salvage('greaterHealingPotion')).toEqual({ materials: [{ materialId: 'coal', amount: 1 }], gold: 0 });
  });

  it.each([
    ['roguesRoll', 'bone'],
    ['huntersPack', 'bone'],
    ['giftBasket', 'stone'],
    ['healersSatchel', 'stone'],
    ['lantern', 'copper'],
    ['holyRelics', 'copper'],
    ['emberWardSalve', 'iron'],
    ['tideWardSalve', 'iron'],
    ['stormWardSalve', 'iron'],
    ['stoneWardSalve', 'iron'],
    ['thornWardSalve', 'iron'],
    ['scholarsSatchel', 'coal'],
  ])('breaks the 3-unit %s down to 1 %s, its tier\'s main material', (itemId, materialId) => {
    expect(salvage(itemId)).toEqual({ materials: [{ materialId, amount: 1 }], gold: 0 });
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
