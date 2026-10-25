import type { ChestDef } from '@/game/types';

// Loot sticks to materials every tier uses, so chests never hand out ore
// before the player can do anything with it.
export const chests: ChestDef[] = [
  {
    id: 'wooden',
    name: 'Wooden chest',
    emoji: '📦',
    steps: 5000,
    gold: [10, 25],
    loot: [
      { materialId: 'wood', min: 2, max: 4, chance: 0.7 },
      { materialId: 'hide', min: 1, max: 2, chance: 0.5 },
      { materialId: 'herb', min: 1, max: 3, chance: 0.5 },
      { materialId: 'berries', min: 1, max: 2, chance: 0.4 },
    ],
    recipeChance: 0.05,
  },
  {
    id: 'iron',
    name: 'Iron chest',
    emoji: '🧰',
    steps: 10000,
    gold: [30, 70],
    loot: [
      { materialId: 'wood', min: 3, max: 6, chance: 0.7 },
      { materialId: 'hide', min: 2, max: 3, chance: 0.6 },
      { materialId: 'bone', min: 1, max: 3, chance: 0.5 },
      { materialId: 'meat', min: 1, max: 3, chance: 0.4 },
      { materialId: 'mushroom', min: 1, max: 2, chance: 0.4 },
    ],
    recipeChance: 0.15,
  },
];
