import { stoneId } from '@/game/elements';

import { createRng } from '../generation/rng';
import { createInitialSave } from '../save';
import { nextTierReward } from './nextTier';

describe('nextTierReward', () => {
  it('gives an elemental stone from the tier 2 boss: the element of tier 3’s first elemental dungeon', () => {
    const loot = nextTierReward(createInitialSave(), 2, createRng('stone'));
    expect(loot.materials).toEqual([{ materialId: stoneId('electric'), amount: 1 }]);
    expect(loot.dropped).toContain('trophies');
  });

  it('gives no stone from the other tier bosses', () => {
    for (const tier of [1, 3, 4]) expect(nextTierReward(createInitialSave(), tier, createRng('stone')).materials).toEqual([]);
  });
});
