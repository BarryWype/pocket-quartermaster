import { recipeById } from '@/content/lookup';

import { craft } from '../crafting/crafting';
import { createInitialSave, type SaveData } from '../save';
import { equip, heroStats } from '../team/team';
import { canForgeWithIngredient, fittingIngredients, forgeWithIngredient, ingredientAffixId } from './ingredients';

const withMaterials = (counts: Record<string, number>, extra: Partial<SaveData> = {}): SaveData => ({
  ...createInitialSave(),
  materials: counts,
  ...extra,
});

const known = (ids: string[]) => [...createInitialSave().knownRecipes, ...ids];

describe('ingredient affixes', () => {
  it('gives a monster part its weapon affix on a weapon, its armour one on armour and off-hands', () => {
    expect(ingredientAffixId('fangOrHorn', 'sword')).toBe('hunter');
    expect(ingredientAffixId('fangOrHorn', 'mail')).toBe('thickHide');
    expect(ingredientAffixId('fangOrHorn', 'shield')).toBe('thickHide');
  });
});

describe('fitting ingredients', () => {
  it('lists held parts in catalogue order', () => {
    const save = withMaterials({ chitin: 1, fangOrHorn: 3, bone: 1 });
    expect(fittingIngredients(save, recipeById.mace2)).toEqual(['fangOrHorn', 'chitin']);
  });

  it('skips what is no ingredient', () => {
    const save = withMaterials({ fireStone: 1, stone: 3 });
    expect(fittingIngredients(save, recipeById.mace2)).toEqual([]);
  });
});

describe('forging with an ingredient', () => {
  it('needs the blueprint, the full recipe and the ingredient', () => {
    const full = Object.fromEntries(recipeById.sword1.inputs.map((input) => [input.materialId, input.amount]));
    expect(canForgeWithIngredient(withMaterials({ ...full, fangOrHorn: 1 }), recipeById.sword1, 'fangOrHorn')).toBe(true);
    expect(canForgeWithIngredient(withMaterials(full), recipeById.sword1, 'fangOrHorn')).toBe(false);
    const unknown = withMaterials({ stone: 10, wood: 10, fangOrHorn: 1 });
    expect(canForgeWithIngredient(unknown, recipeById.sword2, 'fangOrHorn')).toBe(false);
    expect(() => forgeWithIngredient(unknown, recipeById.sword2, 'fangOrHorn')).toThrow();
  });

  it('spends the full recipe plus one of the ingredient', () => {
    const full = Object.fromEntries(recipeById.sword1.inputs.map((input) => [input.materialId, input.amount]));
    const save = forgeWithIngredient(
      withMaterials({ ...full, fangOrHorn: 2 }, { knownRecipes: known(['sword1']) }),
      recipeById.sword1,
      'fangOrHorn',
    );
    expect(save.materials).toEqual({ fangOrHorn: 1 });
  });

  it('forges an Uncommon piece with that ingredient affix, its value rolled', () => {
    let save = withMaterials({ wood: 100, fangOrHorn: 20 }, { knownRecipes: known(['sword1']) });
    for (let i = 0; i < 20; i++) save = forgeWithIngredient(save, recipeById.sword1, 'fangOrHorn');
    expect(save.gear).toHaveLength(20);
    for (const gear of save.gear) {
      expect(gear.rarity).toBe('uncommon');
      expect(gear.affixes.map((affix) => affix.id)).toEqual(['hunter']);
    }
  });

  it("adds a stat ingredient's affix to the wearer's stats", () => {
    const plain = craft(withMaterials({ bone: 1, hide: 5 }, { knownRecipes: known(['leather1']) }), recipeById.leather1);
    const feathered = forgeWithIngredient(
      withMaterials({ bone: 1, hide: 5, feather: 1 }, { knownRecipes: known(['leather1']) }),
      recipeById.leather1,
      'feather',
    );
    const light = feathered.gear[0].affixes.find((affix) => affix.id === 'light')!;
    const heroId = plain.heroes[0].id;
    const plainSave = equip({ ...plain, gear: [{ ...plain.gear[0], roll: 8 }] }, heroId, 'armor', 'g1');
    const featheredSave = equip({ ...feathered, gear: [{ ...feathered.gear[0], roll: 8, rarity: 'common' }] }, heroId, 'armor', 'g1');
    expect(heroStats(featheredSave, featheredSave.heroes[0]).evasion).toBe(heroStats(plainSave, plainSave.heroes[0]).evasion + light.value);
  });
});
