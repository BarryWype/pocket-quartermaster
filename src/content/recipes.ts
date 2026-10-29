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

  // Provisions: food from meat and berries in the kitchen; potions from herbs
  // and mushrooms, kits and charms from tier 1 materials in alchemy.
  ...provisionRecipes([
    ['trailMix', 'kitchen', { berries: 2 }],
    ['jerky', 'kitchen', { meat: 2 }],
    ['huntersStew', 'kitchen', { meat: 1, berries: 1, herb: 1 }],
    ['scholarsPorridge', 'kitchen', { berries: 1, herb: 2 }],
    ['merchantsPie', 'kitchen', { meat: 1, berries: 1, herb: 1 }],
    ['quickBites', 'kitchen', { meat: 1, berries: 1 }],
    ['comfortBroth', 'kitchen', { meat: 1, herb: 2 }],
    ['healingPotion', 'alchemy', { herb: 2, mushroom: 1 }],
    ['rabbitsFoot', 'alchemy', { bone: 2, hide: 1 }],
    ['luckyTooth', 'alchemy', { bone: 2, wood: 1 }],
    // Kits and ward salves: never learned by drops, but known once the player's
    // highest unlocked tier reaches the kit's (see isKnown in crafting.ts).
    ['roguesRoll', 'alchemy', { bone: 2, hide: 1 }, false, 1],
    ['huntersPack', 'alchemy', { meat: 2, herb: 1, hide: 1 }, false, 1],
    ['emberWardSalve', 'alchemy', { fireShard: 1, herb: 2 }, false, 1],
    ['tideWardSalve', 'alchemy', { waterShard: 1, herb: 2 }, false, 1],
    ['stormWardSalve', 'alchemy', { electricShard: 1, herb: 2 }, false, 1],
    ['stoneWardSalve', 'alchemy', { stoneShard: 1, herb: 2 }, false, 1],
    ['thornWardSalve', 'alchemy', { grassShard: 1, herb: 2 }, false, 1],
    ['explorersKit', 'alchemy', { stone: 1, wood: 2, hide: 2 }, false, 2],
    ['healersSatchel', 'alchemy', { herb: 2, berries: 1, mushroom: 1 }, false, 2],
    ['giftBasket', 'alchemy', { berries: 2, meat: 1, bone: 1 }, false, 2],
    ['lantern', 'alchemy', { copper: 1, wood: 2, meat: 1 }, false, 3],
    ['holyRelics', 'alchemy', { stone: 2, herb: 2 }, false, 3],
    ['scholarsSatchel', 'alchemy', { copper: 2, wood: 1, berries: 2 }, false, 4],
  ]),
];
