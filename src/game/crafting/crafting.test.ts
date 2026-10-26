import { dungeons } from '@/content/dungeons';
import { items } from '@/content/items';
import { recipeById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { QUALITIES } from '@/content/forging';
import { recipes } from '@/content/recipes';

import { createInitialSave, type SaveData } from '../save';
import { canCraft, craft, ownsTool, unlockRecipe } from './crafting';

const withMaterials = (counts: Record<string, number>, extra: Partial<SaveData> = {}): SaveData => ({
  ...createInitialSave(),
  materials: counts,
  ...extra,
});

describe('content', () => {
  it('only references existing items, materials and recipes', () => {
    const itemIds = new Set(items.map((i) => i.id));
    const materialIds = new Set(materials.map((m) => m.id));
    const recipeIds = new Set(recipes.map((r) => r.id));
    for (const recipe of recipes) {
      if ('itemId' in recipe.output) expect(itemIds.has(recipe.output.itemId)).toBe(true);
      else expect(materialIds.has(recipe.output.materialId)).toBe(true);
      recipe.inputs.forEach((input) => expect(materialIds.has(input.materialId)).toBe(true));
      recipe.unlocks?.forEach((id) => expect(recipeIds.has(id)).toBe(true));
    }
    for (const dungeon of dungeons) {
      dungeon.recipeDrops.forEach((drop) => expect(recipeIds.has(drop.recipeId)).toBe(true));
      dungeon.loot.forEach((entry) => expect(materialIds.has(entry.materialId)).toBe(true));
    }
  });

  it('starts with only the wooden sword at the forge', () => {
    const known = createInitialSave().knownRecipes.filter((id) => recipeById[id].station === 'forge');
    expect(known).toEqual(['woodSword']);
  });

  it('makes every forge recipe reachable through pickaxes or dungeon drops', () => {
    const reachable = new Set(createInitialSave().knownRecipes);
    recipes.forEach((r) => r.unlocks?.forEach((id) => reachable.add(id)));
    dungeons.forEach((d) => d.recipeDrops.forEach((drop) => reachable.add(drop.recipeId)));
    recipes.forEach((r) => expect(reachable.has(r.id)).toBe(true));
  });
});

describe('crafting', () => {
  it('needs every input', () => {
    expect(canCraft(withMaterials({ wood: 3 }), recipeById.woodSword)).toBe(true);
    expect(canCraft(withMaterials({ wood: 2 }), recipeById.woodSword)).toBe(false);
  });

  it('crafts a pickaxe once and has it teach the next tier sword only', () => {
    const save = craft(withMaterials({ wood: 5 }, { knownRecipes: ['woodPickaxe'] }), recipeById.woodPickaxe);
    expect(save.tools).toEqual(['woodPickaxe']);
    expect(save.materials).toEqual({ wood: 3 });
    expect(save.knownRecipes).toContain('stoneSword');
    expect(save.knownRecipes).not.toContain('stoneBow');
    expect(save.knownRecipes).not.toContain('stoneWand');
    expect(save.knownRecipes).not.toContain('stoneArmour');
    expect(ownsTool(save, recipeById.woodPickaxe)).toBe(true);
    expect(canCraft(save, recipeById.woodPickaxe)).toBe(false);
  });

  it('forges a gear piece with a quality and a unique id', () => {
    const start = withMaterials({ wood: 7 }, { knownRecipes: ['woodSword'] });
    const twice = craft(craft(start, recipeById.woodSword), recipeById.woodSword);
    expect(twice.gear.map((g) => [g.uid, g.itemId])).toEqual([
      ['g1', 'woodSword'],
      ['g2', 'woodSword'],
    ]);
    twice.gear.forEach((g) => expect(QUALITIES).toContain(g.quality));
    expect(twice.materials).toEqual({ wood: 1 });
  });

  it('uses the costs from the design', () => {
    expect(recipeById.woodSword.inputs).toEqual([{ materialId: 'wood', amount: 3 }]);
    expect(recipeById.woodBow.inputs).toEqual([
      { materialId: 'wood', amount: 3 },
      { materialId: 'hide', amount: 1 },
    ]);
    expect(recipeById.woodWand.inputs).toEqual([
      { materialId: 'wood', amount: 3 },
      { materialId: 'bone', amount: 1 },
    ]);
    expect(recipeById.woodArmour.inputs).toEqual([
      { materialId: 'wood', amount: 5 },
      { materialId: 'hide', amount: 2 },
    ]);
  });

  it('smelts steel from iron and coal', () => {
    const save = craft(withMaterials({ iron: 2, coal: 1 }, { knownRecipes: ['smeltSteel'] }), recipeById.smeltSteel);
    expect(save.materials).toEqual({ steel: 1 });
  });

  it('teaches smelting with the iron pickaxe', () => {
    const save = craft(withMaterials({ iron: 3, wood: 2 }, { knownRecipes: ['ironPickaxe'] }), recipeById.ironPickaxe);
    expect(save.knownRecipes).toEqual(expect.arrayContaining(['smeltSteel', 'steelSword']));
  });

  it('brews consumables into a stack', () => {
    const potion = recipeById.healingPotion;
    const save = craft(craft(withMaterials({ herb: 4, berries: 2 }), potion), potion);
    expect(save.consumables).toEqual({ healingPotion: 2 });
    expect(save.materials).toEqual({});
  });

  it('cannot craft a locked recipe until it is unlocked', () => {
    const save = withMaterials({ wood: 3, hide: 1 });
    expect(canCraft(save, recipeById.woodBow)).toBe(false);
    expect(() => craft(save, recipeById.woodBow)).toThrow();
    expect(canCraft(unlockRecipe(save, 'woodBow'), recipeById.woodBow)).toBe(true);
  });
});
