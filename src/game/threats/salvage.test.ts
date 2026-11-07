import { threatRules } from '@/content/threats';

import { salvage } from './salvage';

describe('salvage', () => {
  it('returns half of each recipe input, the main one at least 1', () => {
    expect(salvage('healingPotion')).toEqual({ materials: [{ materialId: 'herb', amount: 1 }], gold: 0 });
    expect(salvage('herbalPoultice')).toEqual({ materials: [{ materialId: 'herb', amount: 1 }], gold: 0 });
    expect(salvage('fishermansChowder')).toEqual({ materials: [{ materialId: 'fish', amount: 1 }], gold: 0 });
  });

  it('breaks the stronger potions down to their tier’s main material', () => {
    expect(salvage('standardHealingPotion')).toEqual({ materials: [{ materialId: 'copper', amount: 1 }], gold: 0 });
    expect(salvage('greaterHealingPotion')).toEqual({ materials: [{ materialId: 'coal', amount: 1 }], gold: 0 });
  });

  it('pays a little gold without a recipe', () => {
    expect(salvage('shinyPebble')).toEqual({ materials: [], gold: threatRules.salvageGold });
  });
});
