import { tierMaterials } from '@/content/materials';
import { stoneId } from '@/game/elements';

import { weaponTypeFor } from '../equipment/weaponOfChoice';
import { createRng } from '../generation/rng';
import { createInitialSave } from '../save';
import { footholdRecipe, nextTierReward } from './nextTier';

const isStone = (id: string) => id.endsWith('Stone');

describe('nextTierReward', () => {
  it('gives an elemental stone from the tier 2 boss: the element of tier 3’s first elemental dungeon', () => {
    const loot = nextTierReward(createInitialSave(), 2, createRng('stone'));
    expect(loot.materials).toContainEqual({ materialId: stoneId('electric'), amount: 1 });
    expect(loot.dropped).toContain('trophies');
  });

  it('gives no stone from the other tier bosses', () => {
    for (const tier of [1, 3, 4]) {
      expect(nextTierReward(createInitialSave(), tier, createRng('stone')).materials.some((m) => isStone(m.materialId))).toBe(false);
    }
  });

  it('gives a foothold at every tier boss: the next tier’s weapon blueprint and its main material for one craft', () => {
    for (const tier of [1, 2, 3, 4]) {
      const save = createInitialSave();
      const recipe = footholdRecipe(save, tier + 1)!;
      const loot = nextTierReward(save, tier, createRng('foothold'));
      expect(loot.recipeIds).toContain(recipe.id);
      const main = recipe.inputs.find((input) => input.materialId === tierMaterials[tier])!;
      expect(loot.materials).toContainEqual({ materialId: main.materialId, amount: main.amount });
    }
  });

  it('picks the weapon of the starting-trio class whose hero is most levelled, the trio’s order on a tie', () => {
    const save = createInitialSave();
    expect(footholdRecipe(save, 2)!.output).toEqual({ itemId: `${weaponTypeFor('warrior')}2` });
    const lyraAhead = { ...save, heroes: save.heroes.map((h) => (h.classId === 'ranger' ? { ...h, level: 5 } : h)) };
    expect(footholdRecipe(lyraAhead, 2)!.output).toEqual({ itemId: `${weaponTypeFor('ranger')}2` });
  });

  it('gives nothing after the last tier', () => {
    expect(nextTierReward(createInitialSave(), 5, createRng('end')).materials).toEqual([]);
  });
});
