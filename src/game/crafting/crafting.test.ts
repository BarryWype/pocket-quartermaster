import { items } from '@/content/items';
import { recipeById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { recipes } from '@/content/recipes';
import { resources } from '@/content/resources';
import { tiers } from '@/content/tiers';
import type { ToolDef } from '@/game/types';

import { createInitialSave } from '../save';
import { canCraft, craft, unlockRecipe } from './crafting';

const withMaterials = (counts: Record<string, number>) => ({ ...createInitialSave(), materials: counts });

describe('content', () => {
  it('only references existing items and materials', () => {
    const itemIds = new Set(items.map((i) => i.id));
    const materialIds = new Set(materials.map((m) => m.id));
    for (const recipe of recipes) {
      expect(itemIds.has(recipe.itemId)).toBe(true);
      recipe.inputs.forEach((input) => expect(materialIds.has(input.materialId)).toBe(true));
    }
  });

  it('has around 6 forge and 3 alchemy recipes, some locked', () => {
    expect(recipes.filter((r) => r.station === 'forge').length).toBeGreaterThanOrEqual(6);
    expect(recipes.filter((r) => r.station === 'alchemy')).toHaveLength(3);
    expect(recipes.some((r) => !r.unlockedByDefault)).toBe(true);
  });

  it('has a pickaxe, sword, bow, wand and armor in every tier', () => {
    for (const tier of tiers) {
      const tierItems = items.filter((i) => i.tier === tier.id);
      expect(tierItems.filter((i) => i.slot === 'tool')).toHaveLength(1);
      expect(tierItems.filter((i) => i.slot === 'armor')).toHaveLength(1);
      const weapons = tierItems.flatMap((i) => (i.slot === 'weapon' ? [i.weaponType] : []));
      expect(weapons.sort()).toEqual(['bow', 'sword', 'wand']);
    }
  });

  it('makes each pickaxe from materials the previous pickaxe can mine', () => {
    const neededPower = (materialId: string) =>
      resources.find((r) => r.kind === 'ore' && r.yields.some((y) => y.materialId === materialId))?.requiresPickaxe ?? 0;
    const pickaxes = items.filter((i): i is ToolDef => i.slot === 'tool');
    expect(pickaxes.map((p) => p.power)).toEqual([1, 2, 3, 4, 5]);
    for (const pickaxe of pickaxes) {
      for (const input of recipeById[pickaxe.id].inputs) {
        expect(neededPower(input.materialId)).toBeLessThan(pickaxe.power);
      }
    }
  });
});

describe('crafting', () => {
  const sword = recipeById.ironSword;
  const potion = recipeById.healingPotion;
  const blade = recipeById.starforgedBlade;

  it('needs every input', () => {
    expect(canCraft(withMaterials({ ironOre: 6, hide: 1 }), sword)).toBe(true);
    expect(canCraft(withMaterials({ ironOre: 5, hide: 1 }), sword)).toBe(false);
  });

  it('forges a gear piece with full durability and consumes the inputs', () => {
    const save = craft(withMaterials({ ironOre: 7, hide: 1 }), sword);
    expect(save.materials).toEqual({ ironOre: 1 });
    expect(save.gear).toEqual([{ uid: 'g1', itemId: 'ironSword', durability: 30 }]);
    expect(save.nextUid).toBe(2);
  });

  it('gives each gear piece a unique id', () => {
    const twice = craft(craft(withMaterials({ ironOre: 12, hide: 2 }), sword), sword);
    expect(twice.gear.map((g) => g.uid)).toEqual(['g1', 'g2']);
  });

  it('crafts a tool once and keeps it', () => {
    const pickaxe = recipeById.woodPickaxe;
    const save = craft(withMaterials({ wood: 2 }), pickaxe);
    expect(save.tools).toEqual(['woodPickaxe']);
    expect(save.gear).toEqual([]);
    expect(save.materials).toEqual({ wood: 1 });
    expect(canCraft(save, pickaxe)).toBe(false);
  });

  it('starts with the copper pickaxe blueprint locked', () => {
    expect(canCraft(withMaterials({ copperOre: 10, wood: 10 }), recipeById.copperPickaxe)).toBe(false);
  });

  it('brews consumables into a stack', () => {
    const save = craft(craft(withMaterials({ herb: 4, berries: 2 }), potion), potion);
    expect(save.consumables).toEqual({ healingPotion: 2 });
    expect(save.materials).toEqual({});
  });

  it('cannot craft a locked recipe until it is unlocked', () => {
    const save = withMaterials({ starMetal: 1, ironOre: 6, coal: 4 });
    expect(canCraft(save, blade)).toBe(false);
    expect(() => craft(save, blade)).toThrow();
    expect(canCraft(unlockRecipe(save, blade.id), blade)).toBe(true);
  });

  it('unlocking twice keeps one entry', () => {
    const save = unlockRecipe(unlockRecipe(createInitialSave(), 'starforgedBlade'), 'starforgedBlade');
    expect(save.knownRecipes.filter((id) => id === 'starforgedBlade')).toHaveLength(1);
  });
});
