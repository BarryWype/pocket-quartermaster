import { relicById } from '@/content/lookup';

import { relicRecipe } from '../../forging/relics';
import { createInitialSave, type SaveData } from '../../save';
import { pickIngredientForge, pickRelic } from './forge';

const known = (ids: string[]) => [...createInitialSave().knownRecipes, ...ids];

/** A save holding the relics and exactly their restore costs, gold included. */
const holding = (relicIds: string[], extra: Partial<SaveData> = {}): SaveData => {
  const save: SaveData = {
    ...createInitialSave(),
    relics: relicIds.map((relicId, i) => ({ uid: `r${i + 1}`, relicId })),
    ...extra,
  };
  const materials = { ...save.materials };
  let gold = save.gold;
  for (const relicId of relicIds) {
    const recipe = relicRecipe(relicById[relicId]);
    for (const { materialId, amount } of recipe.inputs) materials[materialId] = (materials[materialId] ?? 0) + amount;
    gold += recipe.gold;
  }
  return { ...save, materials, gold };
};

describe('pickIngredientForge', () => {
  it('goes on the fitting item of the right hero', () => {
    const save: SaveData = {
      ...createInitialSave(),
      materials: { bone: 2, copper: 3, chitin: 1 },
      knownRecipes: known(['mace1', 'mace2', 'mace3', 'knuckles1']),
    };
    expect(pickIngredientForge(save, ['bram', 'lyra', 'mira'])).toEqual({
      recipeId: 'mace3',
      ingredientId: 'chitin',
      heroId: 'bram',
      slot: 'weapon',
    });
  });

  it('returns null when nothing held is an ingredient', () => {
    const save: SaveData = { ...createInitialSave(), materials: { wood: 3, fireStone: 1 } };
    expect(pickIngredientForge(save, ['bram', 'lyra', 'mira'])).toBeNull();
  });

  it('prefers an ingredient whose affix fits the day, else keeps the first that fits', () => {
    const save: SaveData = {
      ...createInitialSave(),
      materials: { wood: 1, copper: 3, fangOrHorn: 1, venomSac: 1 },
      knownRecipes: known(['sword3']),
    };
    const pick = { recipeId: 'sword3', heroId: 'bram', slot: 'weapon' } as const;
    expect(pickIngredientForge(save, ['bram'])).toEqual({ ...pick, ingredientId: 'fangOrHorn' });
    expect(pickIngredientForge(save, ['bram'], () => false)).toEqual({ ...pick, ingredientId: 'fangOrHorn' });
    expect(pickIngredientForge(save, ['bram'], (affixId) => affixId !== 'hunter')).toEqual({ ...pick, ingredientId: 'venomSac' });
  });
});

describe('pickRelic', () => {
  it('skips a relic whose type no hero can use', () => {
    expect(pickRelic(holding(['bogWitchsWand']), ['bram'])).toBeNull();
  });

  it('picks an affordable fitting relic', () => {
    expect(pickRelic(holding(['barrowKingsBlade']), ['bram'])).toEqual({ relicUid: 'r1', heroId: 'bram', slot: 'weapon' });
  });

  it('prefers the higher tier', () => {
    expect(pickRelic(holding(['sextonsMace', 'barrowKingsBlade']), ['bram'])).toEqual({
      relicUid: 'r2',
      heroId: 'bram',
      slot: 'weapon',
    });
  });
});
