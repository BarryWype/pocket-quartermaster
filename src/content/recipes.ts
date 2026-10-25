import type { RecipeDef } from '@/game/types';

// Progression: the wooden sword is known from the start (the tutorial forges
// it). Each tier boss drops a pickaxe that mines the next tier's material and
// teaches that tier's sword; the tier's bow, wand and armour drop in its
// dungeons (see content/dungeons.ts).
export const recipes: RecipeDef[] = [
  // Tier 1: wood. The wooden pickaxe is the tier 1 boss reward and opens stone.
  {
    id: 'woodPickaxe',
    station: 'forge',
    output: { itemId: 'woodPickaxe' },
    inputs: [{ materialId: 'wood', amount: 2 }],
    unlockedByDefault: false,
    unlocks: ['stoneSword'],
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
    unlocks: ['copperSword'],
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
    unlocks: ['ironSword'],
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
    unlocks: ['smeltSteel', 'steelSword'],
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

  // Alchemy
  {
    id: 'healingPotion',
    station: 'alchemy',
    output: { itemId: 'healingPotion' },
    inputs: [{ materialId: 'herb', amount: 2 }, { materialId: 'berries', amount: 1 }],
    unlockedByDefault: true,
  },
  {
    id: 'ration',
    station: 'alchemy',
    output: { itemId: 'ration' },
    inputs: [{ materialId: 'meat', amount: 2 }, { materialId: 'berries', amount: 1 }],
    unlockedByDefault: true,
  },
  {
    id: 'fireResistanceElixir',
    station: 'alchemy',
    output: { itemId: 'fireResistanceElixir' },
    inputs: [{ materialId: 'mushroom', amount: 2 }, { materialId: 'herb', amount: 1 }, { materialId: 'berries', amount: 1 }],
    unlockedByDefault: false,
  },
];
