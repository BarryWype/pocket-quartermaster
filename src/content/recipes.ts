import type { RecipeDef } from '@/game/types';

export const recipes: RecipeDef[] = [
  // Forge
  {
    id: 'ironSword',
    station: 'forge',
    itemId: 'ironSword',
    inputs: [{ materialId: 'ironOre', amount: 4 }, { materialId: 'hide', amount: 1 }],
    unlockedByDefault: true,
  },
  {
    id: 'copperDagger',
    station: 'forge',
    itemId: 'copperDagger',
    inputs: [{ materialId: 'copperOre', amount: 3 }, { materialId: 'hide', amount: 1 }],
    unlockedByDefault: true,
  },
  {
    id: 'huntingKnife',
    station: 'forge',
    itemId: 'huntingKnife',
    inputs: [{ materialId: 'ironOre', amount: 2 }, { materialId: 'bone', amount: 1 }],
    unlockedByDefault: true,
  },
  {
    id: 'crystalWand',
    station: 'forge',
    itemId: 'crystalWand',
    inputs: [
      { materialId: 'crystal', amount: 2 },
      { materialId: 'copperOre', amount: 2 },
      { materialId: 'bone', amount: 1 },
    ],
    unlockedByDefault: true,
  },
  {
    id: 'boneBow',
    station: 'forge',
    itemId: 'boneBow',
    inputs: [{ materialId: 'bone', amount: 3 }, { materialId: 'hide', amount: 2 }],
    unlockedByDefault: true,
  },
  {
    id: 'leatherArmor',
    station: 'forge',
    itemId: 'leatherArmor',
    inputs: [{ materialId: 'hide', amount: 4 }],
    unlockedByDefault: true,
  },
  {
    id: 'starforgedBlade',
    station: 'forge',
    itemId: 'starforgedBlade',
    inputs: [
      { materialId: 'starMetal', amount: 1 },
      { materialId: 'ironOre', amount: 4 },
      { materialId: 'hide', amount: 2 },
    ],
    unlockedByDefault: false,
  },
  {
    id: 'moonweaveCloak',
    station: 'forge',
    itemId: 'moonweaveCloak',
    inputs: [{ materialId: 'moonpetal', amount: 1 }, { materialId: 'hide', amount: 3 }],
    unlockedByDefault: false,
  },

  // Alchemy
  {
    id: 'healingPotion',
    station: 'alchemy',
    itemId: 'healingPotion',
    inputs: [{ materialId: 'herb', amount: 2 }, { materialId: 'berries', amount: 1 }],
    unlockedByDefault: true,
  },
  {
    id: 'ration',
    station: 'alchemy',
    itemId: 'ration',
    inputs: [{ materialId: 'meat', amount: 2 }, { materialId: 'berries', amount: 1 }],
    unlockedByDefault: true,
  },
  {
    id: 'fireResistanceElixir',
    station: 'alchemy',
    itemId: 'fireResistanceElixir',
    inputs: [
      { materialId: 'mushroom', amount: 2 },
      { materialId: 'herb', amount: 1 },
      { materialId: 'crystal', amount: 1 },
    ],
    unlockedByDefault: false,
  },
];
