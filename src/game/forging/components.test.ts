import { recipeById } from '@/content/lookup';

import { craft } from '../crafting/crafting';
import { createInitialSave, type SaveData } from '../save';
import { equip, heroStats } from '../team/team';
import { canForgeWithComponent, componentFits, componentRecipe, fittingComponents, forgeWithComponent } from './components';

const withMaterials = (counts: Record<string, number>, extra: Partial<SaveData> = {}): SaveData => ({
  ...createInitialSave(),
  materials: counts,
  ...extra,
});

const known = (ids: string[]) => [...createInitialSave().knownRecipes, ...ids];

describe('componentRecipe', () => {
  it('swaps one secondary unit, keeping the tier material', () => {
    expect(componentRecipe(recipeById.sword2, 'ogreKnucklebone')).toEqual([
      { materialId: 'stone', amount: 3 },
      { materialId: 'ogreKnucklebone', amount: 1 },
    ]);
  });

  it('treats the largest input as tier 1 main material, ties to the last listed', () => {
    expect(componentRecipe(recipeById.axe1, 'dragonClaw')).toEqual([
      { materialId: 'wood', amount: 1 },
      { materialId: 'bone', amount: 2 },
      { materialId: 'dragonClaw', amount: 1 },
    ]);
  });

  it('takes the unit from the main material of a one-material recipe', () => {
    expect(componentRecipe(recipeById.sword1, 'fireHeart')).toEqual([
      { materialId: 'wood', amount: 3 },
      { materialId: 'fireHeart', amount: 1 },
    ]);
  });
});

describe('forging with a component', () => {
  it('only fits the listed gear types', () => {
    expect(componentFits('ogreKnucklebone', 'mace')).toBe(true);
    expect(componentFits('ogreKnucklebone', 'sword')).toBe(false);
    expect(componentFits('dragonClaw', 'sword')).toBe(true);
  });

  it('lists held fitting components in catalogue order', () => {
    const save = withMaterials({ fireHeart: 1, captainsSpurs: 1, bone: 1, stone: 3 });
    expect(fittingComponents(save, recipeById.mace2)).toEqual(['fireHeart']);
    expect(fittingComponents(save, recipeById.leather1)).toEqual(['captainsSpurs']);
  });

  it('needs the blueprint and the component', () => {
    const save = withMaterials({ wood: 4, fireHeart: 1 }, { knownRecipes: known(['sword2']) });
    expect(canForgeWithComponent(save, recipeById.sword1, 'fireHeart')).toBe(true);
    // No component held.
    expect(canForgeWithComponent(withMaterials({ wood: 4 }), recipeById.sword1, 'fireHeart')).toBe(false);
    // The tier 2 blueprint is not known yet, and the materials fall short without the wood unit.
    const unknown = withMaterials({ stone: 3, fireHeart: 1 });
    expect(canForgeWithComponent(unknown, recipeById.sword2, 'fireHeart')).toBe(false);
    expect(() => forgeWithComponent(unknown, recipeById.sword2, 'fireHeart')).toThrow();
  });

  it('spends the swapped inputs', () => {
    const save = forgeWithComponent(withMaterials({ stone: 3, ogreKnucklebone: 1 }, { knownRecipes: known(['mace2']) }), recipeById.mace2, 'ogreKnucklebone');
    expect(save.materials).toEqual({});
  });

  it('forges a piece with one component, at least Rare, a heart infusing its element', () => {
    let save = withMaterials({ wood: 100, fireHeart: 20 });
    for (let i = 0; i < 20; i++) save = forgeWithComponent(save, recipeById.sword1, 'fireHeart');
    expect(save.gear).toHaveLength(20);
    for (const gear of save.gear) {
      expect(gear.component).toBe('fireHeart');
      expect(['rare', 'legendary']).toContain(gear.quality);
      expect(gear.element).toBe('fire');
    }
  });

  it('raises mastery like a normal forge', () => {
    const plain = craft(withMaterials({ wood: 4 }), recipeById.sword1);
    const withComponent = forgeWithComponent(withMaterials({ wood: 4, fireHeart: 1 }), recipeById.sword1, 'fireHeart');
    expect(withComponent.mastery.sword).toEqual(plain.mastery.sword);
  });

  it("adds a component's flat stat to the wearer's stats", () => {
    const plain = craft(withMaterials({ bone: 1, hide: 5 }, { knownRecipes: known(['leather1']) }), recipeById.leather1);
    const spurred = forgeWithComponent(
      withMaterials({ bone: 1, hide: 5, captainsSpurs: 1 }, { knownRecipes: known(['leather1']) }),
      recipeById.leather1,
      'captainsSpurs',
    );
    const heroId = plain.heroes[0].id;
    const plainSave = equip(plain, heroId, 'armor', 'g1');
    const spurredSave = equip(spurred, heroId, 'armor', 'g1');
    expect(heroStats(spurredSave, spurredSave.heroes[0]).speed).toBe(heroStats(plainSave, plainSave.heroes[0]).speed + 1);
  });
});
