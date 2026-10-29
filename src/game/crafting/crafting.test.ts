import { dungeons } from '@/content/dungeons';
import { items } from '@/content/items';
import { itemById, recipeById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { QUALITIES } from '@/content/forging';
import { recipes } from '@/content/recipes';

import { createInitialSave, type SaveData } from '../save';
import { startingMastery } from '../forging/mastery';
import type { ProvisionDef } from '../types';
import { canCraft, craft, forgetRecipe, isKnown, learnAllRecipes, ownsTool, unlockRecipe } from './crafting';

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

  it('starts with the tier 1 core kit at the forge', () => {
    const known = createInitialSave().knownRecipes.filter((id) => recipeById[id].station === 'forge');
    expect(known).toEqual(['sword1', 'bow1', 'quiver1', 'wand1', 'mail1', 'shield1']);
  });

  it('makes every forge recipe reachable through the starting kit, pickaxes or dungeon drops', () => {
    const reachable = new Set(createInitialSave().knownRecipes);
    recipes.forEach((r) => r.unlocks?.forEach((id) => reachable.add(id)));
    dungeons.forEach((d) => d.recipeDrops.forEach((drop) => reachable.add(drop.recipeId)));
    // Kit recipes open with the tiers instead (see isKnown).
    recipes.forEach((r) => {
      if (r.availableFromTier !== undefined) reachable.add(r.id);
    });
    const missing = recipes.filter((r) => !reachable.has(r.id));
    // Only the tier 1 recipes of the types no hero starts with are left; the
    // blueprints (a later slice) open them, so no pickaxe or drop teaches them.
    expect(missing.map((r) => r.id).sort()).toEqual([
      'buckler1', 'censer1', 'focus1', 'knuckles1', 'leather1',
      'offhandBlade1', 'plate1', 'robes1', 'spear1', 'tome1', 'warhammer1',
    ].sort());
  });
});

describe('crafting', () => {
  it('needs every input', () => {
    expect(canCraft(withMaterials({ wood: 4 }), recipeById.sword1)).toBe(true);
    expect(canCraft(withMaterials({ wood: 3 }), recipeById.sword1)).toBe(false);
  });

  it('crafts a pickaxe once and has it teach the next tier of every gear type', () => {
    const save = craft(withMaterials({ wood: 5 }, { knownRecipes: ['woodPickaxe'] }), recipeById.woodPickaxe);
    expect(save.tools).toEqual(['woodPickaxe']);
    expect(save.materials).toEqual({ wood: 3 });
    expect(save.knownRecipes).toContain('sword2');
    expect(save.knownRecipes).toContain('mail2');
    expect(save.knownRecipes).toContain('focus2');
    expect(save.knownRecipes).not.toContain('sword3');
    expect(ownsTool(save, recipeById.woodPickaxe)).toBe(true);
    expect(canCraft(save, recipeById.woodPickaxe)).toBe(false);
  });

  it('forges a gear piece with a quality and a unique id', () => {
    const start = withMaterials({ wood: 9 });
    const twice = craft(craft(start, recipeById.sword1), recipeById.sword1);
    expect(twice.gear.map((g) => [g.uid, g.itemId])).toEqual([
      ['g1', 'sword1'],
      ['g2', 'sword1'],
    ]);
    twice.gear.forEach((g) => expect(QUALITIES).toContain(g.quality));
    expect(twice.materials).toEqual({ wood: 1 });
  });

  it('uses the costs from the design', () => {
    expect(recipeById.sword1.inputs).toEqual([{ materialId: 'wood', amount: 4 }]);
    expect(recipeById.bow1.inputs).toEqual([
      { materialId: 'wood', amount: 3 },
      { materialId: 'hide', amount: 1 },
    ]);
    expect(recipeById.wand1.inputs).toEqual([
      { materialId: 'wood', amount: 3 },
      { materialId: 'bone', amount: 1 },
    ]);
    expect(recipeById.mail1.inputs).toEqual([
      { materialId: 'bone', amount: 4 },
      { materialId: 'hide', amount: 2 },
    ]);
  });

  it('smelts steel from iron and coal', () => {
    const save = craft(withMaterials({ iron: 2, coal: 1 }, { knownRecipes: ['smeltSteel'] }), recipeById.smeltSteel);
    expect(save.materials).toEqual({ steel: 1 });
  });

  it('teaches smelting with the iron pickaxe', () => {
    const save = craft(withMaterials({ iron: 3, wood: 2 }, { knownRecipes: ['ironPickaxe'] }), recipeById.ironPickaxe);
    expect(save.knownRecipes).toEqual(expect.arrayContaining(['smeltSteel', 'sword5']));
  });

  it('brews consumables into a stack', () => {
    const potion = recipeById.healingPotion;
    const save = craft(craft(withMaterials({ herb: 4, mushroom: 2 }, { consumables: {} }), potion), potion);
    expect(save.consumables).toEqual({ healingPotion: 2 });
    expect(save.materials).toEqual({});
  });

  it('smokes two fish into one smoked fish, worth 3 supply points', () => {
    const save = craft(withMaterials({ fish: 2 }, { consumables: {} }), recipeById.smokedFish);
    expect(save.materials).toEqual({});
    expect(save.consumables).toEqual({ smokedFish: 1 });
    expect((itemById.smokedFish as ProvisionDef).supply).toBe(3);
  });

  it('cannot craft a locked recipe until it is unlocked', () => {
    const save = withMaterials({ wood: 2, bone: 2 });
    expect(canCraft(save, recipeById.axe1)).toBe(false);
    expect(() => craft(save, recipeById.axe1)).toThrow();
    expect(canCraft(unlockRecipe(save, 'axe1'), recipeById.axe1)).toBe(true);
  });

  it('knows kit recipes once the highest unlocked tier reaches them', () => {
    const save = withMaterials({ bone: 2, hide: 1, iron: 1, fireShard: 1, herb: 1, coal: 1, wood: 1, berries: 1 });
    // Tier 1 is open from the start, so its kits are known right away.
    expect(isKnown(save, recipeById.roguesRoll)).toBe(true);
    expect(canCraft(save, recipeById.roguesRoll)).toBe(true);
    expect(canCraft(save, recipeById.emberWardSalve)).toBe(false);
    // Clearing each tier boss opens the next tier's kits.
    const tier4 = { ...save, clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt'] };
    expect(isKnown(tier4, recipeById.explorersKit)).toBe(true);
    expect(isKnown(tier4, recipeById.lantern)).toBe(true);
    expect(canCraft(tier4, recipeById.emberWardSalve)).toBe(true);
    expect(isKnown(tier4, recipeById.scholarsSatchel)).toBe(false);
    const tier5 = { ...tier4, clearedDungeons: [...tier4.clearedDungeons, 'giantsHall'] };
    expect(canCraft(tier5, recipeById.scholarsSatchel)).toBe(true);
  });

  it('ignores a kit recipe in knownRecipes before its tier', () => {
    const save = withMaterials({ iron: 1, fireShard: 1, herb: 1 }, { knownRecipes: [...createInitialSave().knownRecipes, 'emberWardSalve'] });
    expect(canCraft(save, recipeById.emberWardSalve)).toBe(false);
  });
});

describe('kit recipes', () => {
  // kits.csv: available from tier, and what one kit is made from.
  const table: [string, number, Record<string, number>][] = [
    ['roguesRoll', 1, { bone: 2, hide: 1 }],
    ['huntersPack', 1, { meat: 1, hide: 1, bone: 1 }],
    ['explorersKit', 2, { stone: 1, wood: 1, hide: 2 }],
    ['giftBasket', 2, { stone: 1, berries: 1, meat: 1 }],
    ['healersSatchel', 2, { stone: 1, herb: 1, mushroom: 1 }],
    ['lantern', 3, { copper: 1, wood: 1, meat: 1 }],
    ['holyRelics', 3, { copper: 1, herb: 1, stone: 1 }],
    ['emberWardSalve', 4, { iron: 1, fireShard: 1, herb: 1 }],
    ['tideWardSalve', 4, { iron: 1, waterShard: 1, herb: 1 }],
    ['stormWardSalve', 4, { iron: 1, electricShard: 1, herb: 1 }],
    ['stoneWardSalve', 4, { iron: 1, stoneShard: 1, herb: 1 }],
    ['thornWardSalve', 4, { iron: 1, grassShard: 1, herb: 1 }],
    ['scholarsSatchel', 5, { coal: 1, wood: 1, berries: 1 }],
  ];

  it.each(table)('%s opens at tier %i and is made from its kits.csv inputs', (id, tier, inputs) => {
    const recipe = recipeById[id];
    expect(recipe.availableFromTier).toBe(tier);
    expect(recipe.output).toEqual({ itemId: id });
    expect(Object.fromEntries(recipe.inputs.map((i) => [i.materialId, i.amount]))).toEqual(inputs);
  });
});

describe('consumable recipes', () => {
  // available from tier, and what one item is made from; kitchen food, alchemy the rest.
  const table: [string, number, Record<string, number>][] = [
    ['heartyRoast', 2, { meat: 2, herb: 1 }],
    ['honeyCakes', 2, { berries: 2, herb: 1 }],
    ['pemmican', 2, { meat: 2, berries: 1 }],
    ['spicedSkewers', 3, { meat: 1, herb: 1, mushroom: 1 }],
    ['mushroomRisotto', 3, { mushroom: 2, herb: 1 }],
    ['strengthDraught', 2, { stone: 1, meat: 1, herb: 1 }],
    ['arcaneTonic', 2, { stone: 1, mushroom: 1, berries: 1 }],
    ['ironskinBrew', 2, { stone: 1, bone: 1, herb: 1 }],
    ['firebomb', 2, { stone: 1, wood: 1, meat: 1 }],
    ['nullrootTincture', 3, { copper: 1, mushroom: 1, herb: 1 }],
    ['quicksilver', 3, { copper: 1, berries: 1, mushroom: 1 }],
    ['emberOil', 3, { copper: 1, fireShard: 2, herb: 1 }],
    ['tideOil', 3, { copper: 1, waterShard: 2, herb: 1 }],
    ['stormOil', 3, { copper: 1, electricShard: 2, herb: 1 }],
    ['stoneOil', 3, { copper: 1, stoneShard: 2, herb: 1 }],
    ['thornOil', 3, { copper: 1, grassShard: 2, herb: 1 }],
    ['smokeBomb', 3, { copper: 1, wood: 1, mushroom: 1 }],
    ['revivalDraught', 5, { coal: 1, fireShard: 1, herb: 1 }],
    ['foragersTonic', 1, { herb: 1, berries: 1, wood: 1 }],
    ['huntersMusk', 2, { stone: 1, meat: 1, hide: 1 }],
    ['prospectorsDraught', 3, { copper: 1, mushroom: 1, herb: 1 }],
    ['trackersEye', 3, { copper: 1, berries: 1, bone: 1 }],
    ['herbalPoultice', 1, { herb: 2, hide: 1 }],
    ['restorativeTonic', 3, { copper: 1, herb: 1, mushroom: 1 }],
    ['calmingTea', 3, { copper: 1, herb: 1, berries: 1 }],
    ['standardHealingPotion', 3, { copper: 1, herb: 1, mushroom: 1 }],
    ['greaterHealingPotion', 5, { coal: 1, herb: 1, mushroom: 1 }],
    ['grilledTrout', 1, { fish: 2, herb: 1 }],
    ['saltedFish', 2, { fish: 2, stone: 1 }],
    ['fishermansChowder', 2, { fish: 2, herb: 1, mushroom: 1 }],
  ];
  const kitchen = new Set(['heartyRoast', 'honeyCakes', 'pemmican', 'spicedSkewers', 'mushroomRisotto', 'grilledTrout', 'saltedFish', 'fishermansChowder']);

  it.each(table)('%s opens at tier %i, made from its inputs, in its tab', (id, tier, inputs) => {
    const recipe = recipeById[id];
    expect(recipe.availableFromTier).toBe(tier);
    expect(recipe.output).toEqual({ itemId: id });
    expect(Object.fromEntries(recipe.inputs.map((i) => [i.materialId, i.amount]))).toEqual(inputs);
    expect(recipe.tab).toBe(kitchen.has(id) ? 'kitchen' : 'alchemy');
  });

  it('knows them once the highest unlocked tier reaches them', () => {
    const save = withMaterials({});
    expect(isKnown(save, recipeById.foragersTonic)).toBe(true);
    expect(isKnown(save, recipeById.herbalPoultice)).toBe(true);
    expect(isKnown(save, recipeById.grilledTrout)).toBe(true);
    expect(isKnown(save, recipeById.saltedFish)).toBe(false);
    expect(isKnown(save, recipeById.fishermansChowder)).toBe(false);
    expect(isKnown(save, recipeById.strengthDraught)).toBe(false);
    expect(isKnown(save, recipeById.heartyRoast)).toBe(false);
    const tier2 = { ...save, clearedDungeons: ['banditStockade'] };
    expect(isKnown(tier2, recipeById.heartyRoast)).toBe(true);
    expect(isKnown(tier2, recipeById.strengthDraught)).toBe(true);
    expect(isKnown(tier2, recipeById.saltedFish)).toBe(true);
    expect(isKnown(tier2, recipeById.fishermansChowder)).toBe(true);
    expect(isKnown(tier2, recipeById.standardHealingPotion)).toBe(false);
    const tier3 = { ...tier2, clearedDungeons: [...tier2.clearedDungeons, 'ogreQuarry'] };
    expect(isKnown(tier3, recipeById.standardHealingPotion)).toBe(true);
    const tier4 = { ...save, clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt'] };
    expect(isKnown(tier4, recipeById.emberOil)).toBe(true);
    expect(isKnown(tier4, recipeById.revivalDraught)).toBe(false);
    const tier5 = { ...tier4, clearedDungeons: [...tier4.clearedDungeons, 'giantsHall'] };
    expect(isKnown(tier5, recipeById.revivalDraught)).toBe(true);
    expect(isKnown(tier5, recipeById.greaterHealingPotion)).toBe(true);
    expect(isKnown(tier4, recipeById.greaterHealingPotion)).toBe(false);
  });
});

describe('debug recipe tools', () => {
  it('forgets only the asked recipe', () => {
    const save = forgetRecipe(createInitialSave(), 'sword1');
    expect(save.knownRecipes).not.toContain('sword1');
    expect(save.knownRecipes).toContain('bow1');
    expect(isKnown(save, recipeById.sword1)).toBe(false);
    expect(forgetRecipe(save, 'sword1').knownRecipes).toEqual(save.knownRecipes);
  });

  it('learns every recipe, starting the mastery of new types', () => {
    const save = learnAllRecipes(createInitialSave());
    expect(save.knownRecipes).toHaveLength(Object.keys(recipeById).length);
    expect(isKnown(save, recipeById.warhammer1)).toBe(true);
    expect(save.mastery.warhammer).toEqual(startingMastery(1));
    expect(Object.keys(save.mastery)).toHaveLength(22);
  });
});

describe('forging without a fee', () => {
  const done = { tutorial: { step: 'done' as const, woodSpot: null } };
  const known = (ids: string[]) => [...createInitialSave().knownRecipes, ...ids];

  it('only needs known recipes and materials, whatever the gold', () => {
    const save = withMaterials({ wood: 10, stone: 10, iron: 10 }, { ...done, gold: 0, knownRecipes: known(['sword2', 'sword4', 'woodPickaxe']) });
    expect(canCraft(save, recipeById.sword4)).toBe(true);
    expect(craft(save, recipeById.sword4).gold).toBe(0);
    expect(canCraft(save, recipeById.smeltSteel)).toBe(false);
  });

  it('leaves smelting and provisions free of materials beyond their inputs', () => {
    const save = withMaterials({ iron: 4, coal: 2, herb: 4, mushroom: 2, wood: 4 }, { ...done, knownRecipes: known(['smeltSteel']) });
    expect(craft(save, recipeById.smeltSteel).gold).toBe(0);
    expect(craft(save, recipeById.healingPotion).gold).toBe(0);
    expect(canCraft(withMaterials({ wood: 4 }), recipeById.sword1)).toBe(true);
  });
});
