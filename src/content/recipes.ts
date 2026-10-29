import type { MaterialStack, RecipeDef } from '@/game/types';

import { MATERIAL_TIERS, extraWeaponTypes } from './items';

/** Costs of the newer weapon types, by material (wood is the wood tier's main material too). */
const extraWeaponInputs: Record<string, (material: string) => MaterialStack[]> = {
  Axe: (m) => (m === 'wood' ? [{ materialId: 'wood', amount: 4 }] : [{ materialId: m, amount: 3 }, { materialId: 'wood', amount: 2 }]),
  Mace: (m) => [{ materialId: m, amount: 3 }, { materialId: 'bone', amount: 1 }],
  Dagger: (m) => [{ materialId: m, amount: 2 }, { materialId: 'hide', amount: 1 }],
  Staff: (m) => (m === 'wood' ? [{ materialId: 'wood', amount: 5 }] : [{ materialId: m, amount: 1 }, { materialId: 'wood', amount: 4 }]),
  Lute: (m) =>
    m === 'wood'
      ? [{ materialId: 'wood', amount: 3 }, { materialId: 'hide', amount: 2 }]
      : [{ materialId: m, amount: 1 }, { materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 2 }],
};

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

// Learned when a hero who uses the type is recruited (up to the highest tier
// reached), then from dungeon drops for later tiers.
const extraWeaponRecipes: RecipeDef[] = extraWeaponTypes.flatMap(({ suffix }) =>
  MATERIAL_TIERS.map(({ id }) => ({
    id: `${id}${suffix}`,
    station: 'forge' as const,
    output: { itemId: `${id}${suffix}` },
    inputs: extraWeaponInputs[suffix](id),
    unlockedByDefault: false,
  })),
);

// Progression: the wooden sword is known from the start (the tutorial forges
// it). Each tier boss drops a pickaxe that mines the next tier's material and
// teaches that tier's sword and armour; the tier's bow and wand drop in its
// dungeons (see content/dungeons.ts).
export const recipes: RecipeDef[] = [
  // Tier 1: wood. The wooden pickaxe is the tier 1 boss reward and opens stone.
  {
    id: 'woodPickaxe',
    station: 'forge',
    output: { itemId: 'woodPickaxe' },
    inputs: [{ materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
    unlocks: ['stoneSword', 'stoneArmour'],
  },
  { id: 'woodSword', station: 'forge', output: { itemId: 'woodSword' }, inputs: [{ materialId: 'wood', amount: 3 }], unlockedByDefault: true },
  {
    id: 'woodBow',
    station: 'forge',
    output: { itemId: 'woodBow' },
    inputs: [{ materialId: 'wood', amount: 3 }, { materialId: 'hide', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'woodWand',
    station: 'forge',
    output: { itemId: 'woodWand' },
    inputs: [{ materialId: 'wood', amount: 3 }, { materialId: 'bone', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'woodArmour',
    station: 'forge',
    output: { itemId: 'woodArmour' },
    inputs: [{ materialId: 'wood', amount: 5 }, { materialId: 'hide', amount: 2 }],
    unlockedByDefault: false,
  },

  // Tier 2: stone. The stone pickaxe is the tier 2 boss reward and opens copper.
  {
    id: 'stonePickaxe',
    station: 'forge',
    output: { itemId: 'stonePickaxe' },
    inputs: [{ materialId: 'stone', amount: 3 }, { materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
    unlocks: ['copperSword', 'copperArmour'],
  },
  {
    id: 'stoneSword',
    station: 'forge',
    output: { itemId: 'stoneSword' },
    inputs: [{ materialId: 'stone', amount: 3 }, { materialId: 'wood', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'stoneBow',
    station: 'forge',
    output: { itemId: 'stoneBow' },
    inputs: [{ materialId: 'stone', amount: 2 }, { materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'stoneWand',
    station: 'forge',
    output: { itemId: 'stoneWand' },
    inputs: [{ materialId: 'stone', amount: 2 }, { materialId: 'wood', amount: 2 }, { materialId: 'bone', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'stoneArmour',
    station: 'forge',
    output: { itemId: 'stoneArmour' },
    inputs: [{ materialId: 'stone', amount: 4 }, { materialId: 'hide', amount: 2 }],
    unlockedByDefault: false,
  },

  // Tier 3: copper. The copper pickaxe is the tier 3 boss reward and opens iron.
  {
    id: 'copperPickaxe',
    station: 'forge',
    output: { itemId: 'copperPickaxe' },
    inputs: [{ materialId: 'copper', amount: 3 }, { materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
    unlocks: ['ironSword', 'ironArmour'],
  },
  {
    id: 'copperSword',
    station: 'forge',
    output: { itemId: 'copperSword' },
    inputs: [{ materialId: 'copper', amount: 3 }, { materialId: 'wood', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'copperBow',
    station: 'forge',
    output: { itemId: 'copperBow' },
    inputs: [{ materialId: 'copper', amount: 2 }, { materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'copperWand',
    station: 'forge',
    output: { itemId: 'copperWand' },
    inputs: [{ materialId: 'copper', amount: 2 }, { materialId: 'wood', amount: 2 }, { materialId: 'bone', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'copperArmour',
    station: 'forge',
    output: { itemId: 'copperArmour' },
    inputs: [{ materialId: 'copper', amount: 4 }, { materialId: 'hide', amount: 2 }],
    unlockedByDefault: false,
  },

  // Tier 4: iron. The iron pickaxe is the tier 4 boss reward: it mines coal and
  // teaches steel smelting.
  {
    id: 'ironPickaxe',
    station: 'forge',
    output: { itemId: 'ironPickaxe' },
    inputs: [{ materialId: 'iron', amount: 3 }, { materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
    unlocks: ['smeltSteel', 'steelSword', 'steelArmour'],
  },
  {
    id: 'ironSword',
    station: 'forge',
    output: { itemId: 'ironSword' },
    inputs: [{ materialId: 'iron', amount: 3 }, { materialId: 'wood', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'ironBow',
    station: 'forge',
    output: { itemId: 'ironBow' },
    inputs: [{ materialId: 'iron', amount: 2 }, { materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'ironWand',
    station: 'forge',
    output: { itemId: 'ironWand' },
    inputs: [{ materialId: 'iron', amount: 2 }, { materialId: 'wood', amount: 2 }, { materialId: 'bone', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'ironArmour',
    station: 'forge',
    output: { itemId: 'ironArmour' },
    inputs: [{ materialId: 'iron', amount: 4 }, { materialId: 'hide', amount: 2 }],
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

  // Tier 5: steel. The steel pickaxe is the final boss's trophy for now.
  {
    id: 'steelPickaxe',
    station: 'forge',
    output: { itemId: 'steelPickaxe' },
    inputs: [{ materialId: 'steel', amount: 3 }, { materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
  },
  {
    id: 'steelSword',
    station: 'forge',
    output: { itemId: 'steelSword' },
    inputs: [{ materialId: 'steel', amount: 3 }, { materialId: 'wood', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'steelBow',
    station: 'forge',
    output: { itemId: 'steelBow' },
    inputs: [{ materialId: 'steel', amount: 2 }, { materialId: 'wood', amount: 2 }, { materialId: 'hide', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'steelWand',
    station: 'forge',
    output: { itemId: 'steelWand' },
    inputs: [{ materialId: 'steel', amount: 2 }, { materialId: 'wood', amount: 2 }, { materialId: 'bone', amount: 1 }],
    unlockedByDefault: false,
  },
  {
    id: 'steelArmour',
    station: 'forge',
    output: { itemId: 'steelArmour' },
    inputs: [{ materialId: 'steel', amount: 4 }, { materialId: 'hide', amount: 2 }],
    unlockedByDefault: false,
  },

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

  ...extraWeaponRecipes,
];
