import { recipeById } from '@/content/lookup';

import { grantLoot } from '../loot/grant';
import { emptyLoot } from '../loot/types';
import { createInitialSave, type SaveData } from '../save';
import { canCraft, craft, isKnown } from './crafting';
import { newPartRecipes, seeParts, unlockAllPartRecipes } from './partRecipes';

const tier = (n: number): SaveData => ({
  ...createInitialSave(),
  clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'].slice(0, n - 1),
});

describe('part recipe unlocks', () => {
  it('unlocks a recipe the first time its part drops', () => {
    const before = createInitialSave();
    const after = grantLoot(before, [], { ...emptyLoot(), materials: [{ materialId: 'goblinEar', amount: 1 }] }, 0);
    expect(after.seenParts).toEqual(['goblinEar']);
    expect(newPartRecipes(before, after)).toEqual(['luckyEar']);
    expect(isKnown(after, recipeById.luckyEar)).toBe(true);
  });

  it('unlocks every recipe a part feeds, each known once its tier is reached', () => {
    const save = seeParts(tier(1), ['bruteBlood']);
    expect(save.partRecipes).toEqual(
      expect.arrayContaining(['healingPotionPart', 'standardHealingPotionPart', 'greaterHealingPotionPart']),
    );
    expect(isKnown(save, recipeById.healingPotionPart)).toBe(true);
    expect(isKnown(save, recipeById.standardHealingPotionPart)).toBe(false);
    expect(isKnown({ ...save, clearedDungeons: tier(3).clearedDungeons }, recipeById.standardHealingPotionPart)).toBe(true);
  });

  it('unlocks a two-part recipe only once both have been seen, even if the first is gone', () => {
    const insignia = seeParts(createInitialSave(), ['tatteredInsignia']);
    expect(insignia.partRecipes).toEqual(['bountyToken']);
    const both = grantLoot(insignia, [], { ...emptyLoot(), valuables: [{ valuableId: 'cutGem', tier: 2, amount: 1 }] }, 0);
    expect(both.partRecipes).toContain('architectsSeal');
    expect(both.materials.tatteredInsignia).toBeUndefined();
  });

  it('unlocks the Prism charm on the first rough gem', () => {
    const save = seeParts(createInitialSave(), ['roughGem']);
    expect(save.partRecipes).toEqual(['prismCharm']);
  });

  it('ignores ids no recipe waits on, and parts already seen', () => {
    const save = seeParts(createInitialSave(), ['wood', 'goblinEar']);
    expect(save.seenParts).toEqual(['goblinEar']);
    expect(seeParts(save, ['goblinEar'])).toBe(save);
  });

  it('unlocks every part recipe for debug', () => {
    const save = unlockAllPartRecipes(createInitialSave());
    expect(save.partRecipes).toEqual(expect.arrayContaining(['viperOil', 'firebomb', 'architectsSeal', 'seersCandle']));
  });
});

describe('part recipes', () => {
  const known = (save: SaveData) => unlockAllPartRecipes(save);

  it('makes the same potion from either recipe, stacking', () => {
    let save: SaveData = { ...known(tier(2)), materials: { herb: 3, mushroom: 1, bruteBlood: 1 }, consumables: {} };
    save = craft(save, recipeById.healingPotion);
    save = craft(save, recipeById.healingPotionPart);
    expect(save.consumables.healingPotion).toBe(2);
    expect(save.materials).toEqual({});
  });

  it('no longer makes part-only potions from their old materials', () => {
    const save: SaveData = { ...known(tier(2)), materials: { stone: 1, wood: 1, meat: 1 } };
    expect(canCraft(save, recipeById.firebomb)).toBe(false);
    expect(canCraft({ ...save, materials: { stone: 1, wood: 1, scale: 1 } }, recipeById.firebomb)).toBe(true);
  });

  it('makes Viper oil from two venom sacs at tier 2', () => {
    const save: SaveData = { ...known(tier(2)), materials: { venomSac: 2 } };
    expect(isKnown(known(tier(1)), recipeById.viperOil)).toBe(false);
    expect(craft(save, recipeById.viperOil).consumables.viperOil).toBe(1);
  });

  it('spends the lowest-tier gem and the shards of the element held most', () => {
    const save: SaveData = {
      ...known(tier(1)),
      materials: { fireShard: 2, waterShard: 3 },
      valuables: { 'roughGem:3': 1, 'roughGem:1': 1 },
    };
    const after = craft(save, recipeById.prismCharm);
    expect(after.consumables.prismCharm).toBe(1);
    expect(after.materials).toEqual({ fireShard: 2, waterShard: 1 });
    expect(after.valuables).toEqual({ 'roughGem:3': 1 });
    expect(canCraft({ ...save, materials: { fireShard: 1, waterShard: 1 } }, recipeById.prismCharm)).toBe(false);
    expect(canCraft({ ...save, valuables: {} }, recipeById.prismCharm)).toBe(false);
  });
});
