import { gearRecipes } from '@/content/equipment';
import { items } from '@/content/items';
import { materials } from '@/content/materials';
import { valuables } from '@/content/loot/valuables';
import { relics } from '@/content/loot/relics';
import { recipes } from '@/content/recipes';
import { createInitialSave } from '@/game/save';
import type { RecipeDef } from '@/game/types';

import { ingredientIds, nextSteps, purposesOf, weaknessItems, type BaseItemRef } from './purposes';

const save = () => createInitialSave();

describe('purpose tags', () => {
  const refs: BaseItemRef[] = [
    ...materials.map((m): BaseItemRef => ({ kind: 'material', id: m.id })),
    ...valuables.map((v): BaseItemRef => ({ kind: 'valuable', id: v.id })),
    ...relics.map((r): BaseItemRef => ({ kind: 'relic', id: r.id })),
    ...weaknessItems.map((i): BaseItemRef => ({ kind: 'weakness', id: i.id })),
    { kind: 'keyFragment' },
    { kind: 'mysteriousKey' },
    { kind: 'treasureMap' },
    { kind: 'manual' },
    { kind: 'blueprint', id: 'sword2' },
  ];

  it('gives every base item at least one purpose', () => {
    for (const ref of refs) {
      expect([ref, purposesOf(ref).length > 0]).toEqual([ref, true]);
    }
  });

  it('computes the ingredient tag from recipes, never by hand', () => {
    // A material no recipe uses and no catalogue entry describes.
    const unused: BaseItemRef = { kind: 'material', id: 'nothingUsesThis' };
    expect(purposesOf(unused)).toEqual([]);
    const fakeRecipe: RecipeDef = {
      id: 'fakeRecipe',
      station: 'provisions',
      tab: 'alchemy',
      output: { materialId: 'nothingUsesThis', amount: 1 },
      inputs: [{ materialId: 'nothingUsesThis', amount: 1 }],
      unlockedByDefault: false,
    };
    expect(purposesOf(unused, [...recipes, fakeRecipe])).toEqual(['ingredient']);
    expect(ingredientIds([fakeRecipe]).has('nothingUsesThis')).toBe(true);
  });

  it('keeps Good on valuables only, Restore on relics only, Collect on key fragments', () => {
    for (const ref of refs) {
      const purposes = purposesOf(ref);
      expect(purposes.includes('good')).toBe(ref.kind === 'valuable');
      expect(purposes.includes('restore')).toBe(ref.kind === 'relic');
      expect(purposes.includes('collect')).toBe(ref.kind === 'keyFragment');
    }
    // Gems are goods and ingredients both.
    expect(purposesOf({ kind: 'valuable', id: 'roughGem' })).toEqual(['ingredient', 'good']);
  });

  it('tags quest on boss weakness items, use on maps, manuals, keys and blueprints', () => {
    expect(purposesOf({ kind: 'weakness', id: 'wantedPoster' })).toEqual(['quest']);
    expect(purposesOf({ kind: 'mysteriousKey' })).toEqual(['use']);
    expect(purposesOf({ kind: 'treasureMap' })).toEqual(['use']);
    expect(purposesOf({ kind: 'manual' })).toEqual(['use']);
    expect(purposesOf({ kind: 'blueprint', id: 'sword2' })).toEqual(['use']);
  });
});

describe('what’s next', () => {
  it('shows set progress for key fragments', () => {
    expect(nextSteps({ ...save(), keyFragments: 2 }, { kind: 'keyFragment' })).toEqual([{ kind: 'set', have: 2, need: 4 }]);
  });

  it('prices a valuable at the market, at its tier', () => {
    expect(nextSteps(save(), { kind: 'valuable', id: 'oldCoins' })).toEqual([{ kind: 'sell', place: 'market', price: 5 }]);
    expect(nextSteps(save(), { kind: 'valuable', id: 'oldCoins', tier: 3 })).toEqual([{ kind: 'sell', place: 'market', price: 20 }]);
  });

  it('points a weakness item at its boss', () => {
    expect(nextSteps(save(), { kind: 'weakness', id: 'wantedPoster' })).toEqual([{ kind: 'boss', bossId: 'banditCaptain' }]);
  });

  it('costs a relic its type recipe at its tier, times one and a half rounded up', () => {
    const steps = nextSteps(save(), { kind: 'relic', id: 'sextonsMace' });
    const base = gearRecipes.mace[0];
    expect(steps).toEqual([
      {
        kind: 'restore',
        cost: base.map((stack) => ({ materialId: stack.materialId, amount: Math.ceil(stack.amount * 1.5) })),
      },
    ]);
  });

  it('shows the recipes that use a material, and flags unknown ones', () => {
    const fakeRecipe: RecipeDef = {
      id: 'unknownRecipe',
      station: 'provisions',
      tab: 'alchemy',
      output: { itemId: 'healingPotion' },
      inputs: [{ materialId: 'mysteryDust', amount: 2 }],
      unlockedByDefault: false,
    };
    // A material only an unknown recipe uses.
    expect(nextSteps(save(), { kind: 'material', id: 'mysteryDust' }, [...recipes, fakeRecipe])).toEqual([
      { kind: 'recipes', known: [], unknown: true },
    ]);
    // Once that recipe is known, it shows and the flag comes from none being known before.
    const saveWithRecipe = { ...save(), knownRecipes: [...save().knownRecipes, 'unknownRecipe'] };
    expect(nextSteps(saveWithRecipe, { kind: 'material', id: 'mysteryDust' }, [...recipes, fakeRecipe])).toEqual([
      { kind: 'recipes', known: ['unknownRecipe'], unknown: false },
    ]);
  });

  it('offers the use action for maps, manuals, keys and blueprints', () => {
    expect(nextSteps(save(), { kind: 'treasureMap' })).toEqual([{ kind: 'action', action: 'read' }]);
    expect(nextSteps(save(), { kind: 'manual' })).toEqual([{ kind: 'action', action: 'read' }]);
    expect(nextSteps(save(), { kind: 'mysteriousKey' })).toEqual([{ kind: 'action', action: 'open' }]);
    expect(nextSteps(save(), { kind: 'blueprint', id: 'sword2' })).toEqual([{ kind: 'action', action: 'learn' }]);
  });

  it('gives a weakness item ref for every item with a weakness', () => {
    expect(weaknessItems).toHaveLength(items.filter((i) => 'weakness' in i).length);
  });
});
