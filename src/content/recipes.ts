import type { MaterialStack, RecipeDef } from '@/game/types';

import { gearId, gearRecipes } from './equipment';
import { tierRecipes } from '@/game/crafting/recipeUnlocks';

/** Provisions recipes: [item id, tab, inputs, known from the start (default yes), known from tier]. */
function provisionRecipes(
  list: [string, 'kitchen' | 'alchemy', Record<string, number>, boolean?, number?][],
): RecipeDef[] {
  return list.map(([itemId, tab, inputs, unlockedByDefault = true, availableFromTier]) => ({
    id: itemId,
    station: 'provisions' as const,
    tab,
    output: { itemId },
    inputs: Object.entries(inputs).map(([materialId, amount]) => ({ materialId, amount })),
    unlockedByDefault,
    ...(availableFromTier !== undefined ? { availableFromTier } : {}),
  }));
}

// Progression: the tier 1 starting set (see crafting/recipeUnlocks.ts) is known
// from the start; the tutorial forges the wooden sword. Each tier boss drops a
// pickaxe that mines the next tier's material and teaches that tier's recipes.
export const recipes: RecipeDef[] = [
  // The wooden pickaxe is the tier 1 boss reward and opens tier 2.
  {
    id: 'woodPickaxe',
    station: 'forge',
    output: { itemId: 'woodPickaxe' },
    inputs: [{ materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
    unlocks: tierRecipes(2),
  },
  {
    id: 'stonePickaxe',
    station: 'forge',
    output: { itemId: 'stonePickaxe' },
    inputs: [{ materialId: 'stone', amount: 3 }, { materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
    unlocks: tierRecipes(3),
  },
  {
    id: 'copperPickaxe',
    station: 'forge',
    output: { itemId: 'copperPickaxe' },
    inputs: [{ materialId: 'copper', amount: 3 }, { materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
    unlocks: tierRecipes(4),
  },
  {
    // The iron pickaxe is the tier 4 boss reward: it mines coal and teaches steel smelting.
    id: 'ironPickaxe',
    station: 'forge',
    output: { itemId: 'ironPickaxe' },
    inputs: [{ materialId: 'iron', amount: 3 }, { materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
    unlocks: ['smeltSteel', ...tierRecipes(5)],
  },
  {
    id: 'steelPickaxe',
    station: 'forge',
    output: { itemId: 'steelPickaxe' },
    inputs: [{ materialId: 'steel', amount: 3 }, { materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
  },

  // Steel is the only alloy, smelted from iron and coal.
  {
    id: 'smeltSteel',
    station: 'forge',
    output: { materialId: 'steel', amount: 1 },
    inputs: [{ materialId: 'iron', amount: 2 }, { materialId: 'coal', amount: 1 }],
    unlockedByDefault: false,
  },

  // Gear recipes (id = item id), known through the temporary unlock rule above.
  ...(Object.keys(gearRecipes) as (keyof typeof gearRecipes)[]).flatMap((type) =>
    gearRecipes[type].map((inputs, i): RecipeDef => ({
      id: gearId(type, i + 1),
      station: 'forge',
      output: { itemId: gearId(type, i + 1) },
      inputs: inputs as MaterialStack[],
      unlockedByDefault: false,
    })),
  ),

  // Provisions: food from meat and berries in the kitchen; potions, elixirs,
  // oils and utilities from herbs and mushrooms in alchemy, kits from their
  // tier's main material. Beyond the starting set, recipes are known once the
  // player's highest unlocked tier reaches theirs (see isKnown in crafting.ts).
  ...provisionRecipes([
    ['trailMix', 'kitchen', { berries: 2 }],
    ['jerky', 'kitchen', { meat: 2 }],
    ['smokedFish', 'kitchen', { fish: 2 }],
    ['grilledTrout', 'kitchen', { fish: 2, herb: 1 }, false, 1],
    ['huntersStew', 'kitchen', { meat: 1, berries: 1, herb: 1 }],
    ['scholarsPorridge', 'kitchen', { berries: 1, herb: 2 }],
    ['merchantsPie', 'kitchen', { meat: 1, berries: 1, herb: 1 }],
    ['quickBites', 'kitchen', { meat: 1, berries: 1 }],
    ['comfortBroth', 'kitchen', { meat: 1, herb: 2 }],
    ['healingPotion', 'alchemy', { herb: 2, mushroom: 1 }],
    ['roguesRoll', 'alchemy', { bone: 2, hide: 1 }, false, 1],
    ['huntersPack', 'alchemy', { bone: 1, meat: 1, hide: 1 }, false, 1],
    // The tier's main material comes first: salvage gives back at least 1 of it.
    ['foragersTonic', 'alchemy', { herb: 1, berries: 1, wood: 1 }, false, 1],
    ['herbalPoultice', 'alchemy', { herb: 2, hide: 1 }, false, 1],
    ['heartyRoast', 'kitchen', { meat: 2, herb: 1 }, false, 2],
    ['honeyCakes', 'kitchen', { berries: 2, herb: 1 }, false, 2],
    ['pemmican', 'kitchen', { meat: 2, berries: 1 }, false, 2],
    ['saltedFish', 'kitchen', { fish: 2, stone: 1 }, false, 2],
    ['fishermansChowder', 'kitchen', { fish: 2, herb: 1, mushroom: 1 }, false, 2],
    ['strengthDraught', 'alchemy', { stone: 1, meat: 1, herb: 1 }, false, 2],
    ['arcaneTonic', 'alchemy', { stone: 1, mushroom: 1, berries: 1 }, false, 2],
    ['ironskinBrew', 'alchemy', { stone: 1, bone: 1, herb: 1 }, false, 2],
    ['firebomb', 'alchemy', { stone: 1, wood: 1, meat: 1 }, false, 2],
    ['huntersMusk', 'alchemy', { stone: 1, meat: 1, hide: 1 }, false, 2],
    ['explorersKit', 'alchemy', { stone: 1, wood: 1, hide: 2 }, false, 2],
    ['giftBasket', 'alchemy', { stone: 1, berries: 1, meat: 1 }, false, 2],
    ['healersSatchel', 'alchemy', { stone: 1, herb: 1, mushroom: 1 }, false, 2],
    ['nullrootTincture', 'alchemy', { copper: 1, mushroom: 1, herb: 1 }, false, 3],
    ['quicksilver', 'alchemy', { copper: 1, berries: 1, mushroom: 1 }, false, 3],
    ['emberOil', 'alchemy', { copper: 1, fireShard: 2, herb: 1 }, false, 3],
    ['tideOil', 'alchemy', { copper: 1, waterShard: 2, herb: 1 }, false, 3],
    ['stormOil', 'alchemy', { copper: 1, electricShard: 2, herb: 1 }, false, 3],
    ['stoneOil', 'alchemy', { copper: 1, stoneShard: 2, herb: 1 }, false, 3],
    ['thornOil', 'alchemy', { copper: 1, grassShard: 2, herb: 1 }, false, 3],
    ['smokeBomb', 'alchemy', { copper: 1, wood: 1, mushroom: 1 }, false, 3],
    ['prospectorsDraught', 'alchemy', { copper: 1, mushroom: 1, herb: 1 }, false, 3],
    ['trackersEye', 'alchemy', { copper: 1, berries: 1, bone: 1 }, false, 3],
    ['restorativeTonic', 'alchemy', { copper: 1, herb: 1, mushroom: 1 }, false, 3],
    ['standardHealingPotion', 'alchemy', { copper: 1, herb: 1, mushroom: 1 }, false, 3],
    ['calmingTea', 'alchemy', { copper: 1, herb: 1, berries: 1 }, false, 3],
    ['spicedSkewers', 'kitchen', { meat: 1, herb: 1, mushroom: 1 }, false, 3],
    ['mushroomRisotto', 'kitchen', { mushroom: 2, herb: 1 }, false, 3],
    ['lantern', 'alchemy', { copper: 1, wood: 1, meat: 1 }, false, 3],
    ['holyRelics', 'alchemy', { copper: 1, herb: 1, stone: 1 }, false, 3],
    ['emberWardSalve', 'alchemy', { iron: 1, fireShard: 1, herb: 1 }, false, 4],
    ['tideWardSalve', 'alchemy', { iron: 1, waterShard: 1, herb: 1 }, false, 4],
    ['stormWardSalve', 'alchemy', { iron: 1, electricShard: 1, herb: 1 }, false, 4],
    ['stoneWardSalve', 'alchemy', { iron: 1, stoneShard: 1, herb: 1 }, false, 4],
    ['thornWardSalve', 'alchemy', { iron: 1, grassShard: 1, herb: 1 }, false, 4],
    ['revivalDraught', 'alchemy', { coal: 1, fireShard: 1, herb: 1 }, false, 5],
    ['scholarsSatchel', 'alchemy', { coal: 1, wood: 1, berries: 1 }, false, 5],
    ['greaterHealingPotion', 'alchemy', { coal: 1, herb: 1, mushroom: 1 }, false, 5],
  ]),
];
