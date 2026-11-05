import { recipeById } from '@/content/lookup';

import { craft } from '../crafting/crafting';
import { createInitialSave, type SaveData } from '../save';
import { equip, heroStats } from '../team/team';
import { canForgeWithComponent, componentFits, fittingComponents, forgeWithComponent } from './components';

const withMaterials = (counts: Record<string, number>, extra: Partial<SaveData> = {}): SaveData => ({
  ...createInitialSave(),
  materials: counts,
  ...extra,
});

const known = (ids: string[]) => [...createInitialSave().knownRecipes, ...ids];

describe('forging with a component', () => {
  it('only fits the listed gear types', () => {
    expect(componentFits('ogreKnucklebone', 'mace')).toBe(true);
    expect(componentFits('ogreKnucklebone', 'sword')).toBe(false);
    expect(componentFits('dragonClaw', 'sword')).toBe(true);
  });

  it('lists held fitting components in catalogue order', () => {
    const save = withMaterials({ ogreKnucklebone: 1, captainsSpurs: 1, bone: 1, stone: 3 });
    expect(fittingComponents(save, recipeById.mace2)).toEqual(['ogreKnucklebone']);
    expect(fittingComponents(save, recipeById.leather1)).toEqual(['captainsSpurs']);
  });

  it('needs the blueprint, the full recipe and the component', () => {
    const full = Object.fromEntries(recipeById.sword1.inputs.map((input) => [input.materialId, input.amount]));
    expect(canForgeWithComponent(withMaterials({ ...full, dragonClaw: 1 }), recipeById.sword1, 'dragonClaw')).toBe(true);
    expect(canForgeWithComponent(withMaterials(full), recipeById.sword1, 'dragonClaw')).toBe(false);
    const unknown = withMaterials({ stone: 10, wood: 10, dragonClaw: 1 });
    expect(canForgeWithComponent(unknown, recipeById.sword2, 'dragonClaw')).toBe(false);
    expect(() => forgeWithComponent(unknown, recipeById.sword2, 'dragonClaw')).toThrow();
  });

  it('spends the full recipe plus the component', () => {
    const full = Object.fromEntries(recipeById.mace2.inputs.map((input) => [input.materialId, input.amount]));
    const save = forgeWithComponent(
      withMaterials({ ...full, ogreKnucklebone: 1 }, { knownRecipes: known(['mace2']) }),
      recipeById.mace2,
      'ogreKnucklebone',
    );
    expect(Object.values(save.materials).every((amount) => amount === 0)).toBe(true);
  });

  it('forges an Uncommon piece carrying the component affix', () => {
    let save = withMaterials({ wood: 100, dragonClaw: 20 });
    for (let i = 0; i < 20; i++) save = forgeWithComponent(save, recipeById.sword1, 'dragonClaw');
    expect(save.gear).toHaveLength(20);
    for (const gear of save.gear) {
      expect(gear.rarity).toBe('uncommon');
      expect(gear.affixes.map((affix) => affix.id)).toEqual(['cleaving']);
    }
  });

  it("adds a stat component's affix to the wearer's stats", () => {
    const plain = craft(withMaterials({ bone: 1, hide: 5 }, { knownRecipes: known(['leather1']) }), recipeById.leather1);
    const spurred = forgeWithComponent(
      withMaterials({ bone: 1, hide: 5, captainsSpurs: 1 }, { knownRecipes: known(['leather1']) }),
      recipeById.leather1,
      'captainsSpurs',
    );
    const fleet = spurred.gear[0].affixes.find((affix) => affix.id === 'fleet')!;
    const heroId = plain.heroes[0].id;
    const plainSave = equip({ ...plain, gear: [{ ...plain.gear[0], roll: 8 }] }, heroId, 'armor', 'g1');
    const spurredSave = equip({ ...spurred, gear: [{ ...spurred.gear[0], roll: 8, rarity: 'common' }] }, heroId, 'armor', 'g1');
    expect(heroStats(spurredSave, spurredSave.heroes[0]).speed).toBe(heroStats(plainSave, plainSave.heroes[0]).speed + fleet.value);
  });
});
