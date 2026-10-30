import { relicById } from '@/content/lookup';

import { relicRecipe } from '../../forging/relics';
import { createInitialSave, type SaveData } from '../../save';
import { pickComponentForge, pickRelic } from './forge';

const known = (ids: string[]) => [...createInitialSave().knownRecipes, ...ids];

/** A save holding the relics and exactly their restore costs, gems included. */
const holding = (relicIds: string[], extra: Partial<SaveData> = {}): SaveData => {
  const save: SaveData = {
    ...createInitialSave(),
    relics: relicIds.map((relicId, i) => ({ uid: `r${i + 1}`, relicId })),
    ...extra,
  };
  const materials = { ...save.materials };
  const valuables = { ...save.valuables };
  for (const relicId of relicIds) {
    const recipe = relicRecipe(relicById[relicId]);
    for (const { materialId, amount } of recipe.inputs) materials[materialId] = (materials[materialId] ?? 0) + amount;
    for (const { valuableId, amount } of recipe.valuables ?? []) {
      valuables[`${valuableId}:1`] = (valuables[`${valuableId}:1`] ?? 0) + amount;
    }
  }
  return { ...save, materials, valuables };
};

describe('pickComponentForge', () => {
  it('goes on the fitting item of the right hero', () => {
    const save: SaveData = {
      ...createInitialSave(),
      materials: { bone: 2, copper: 3, ogreKnucklebone: 1 },
      knownRecipes: known(['mace1', 'mace2', 'mace3', 'knuckles1']),
    };
    expect(pickComponentForge(save, ['bram', 'lyra', 'mira'])).toEqual({
      recipeId: 'mace3',
      componentId: 'ogreKnucklebone',
      heroId: 'bram',
      slot: 'weapon',
    });
  });

  it('returns null for a component that fits nothing known', () => {
    const save: SaveData = { ...createInitialSave(), materials: { wood: 3, giantsHeartstone: 1 } };
    expect(pickComponentForge(save, ['bram', 'lyra', 'mira'])).toBeNull();
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
