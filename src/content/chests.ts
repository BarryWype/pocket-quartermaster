import type { ChestDef } from '@/game/types';

export const chests: ChestDef[] = [
  {
    id: 'wooden',
    name: 'Wooden chest',
    emoji: '📦',
    steps: 5000,
    gold: [10, 25],
    loot: [
      { materialId: 'wood', min: 2, max: 4, chance: 0.7 },
      { materialId: 'stone', min: 1, max: 3, chance: 0.5 },
      { materialId: 'hide', min: 1, max: 2, chance: 0.5 },
      { materialId: 'herb', min: 1, max: 3, chance: 0.5 },
      { materialId: 'crystal', min: 1, max: 1, chance: 0.2 },
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
      { materialId: 'copperOre', min: 2, max: 4, chance: 0.6 },
      { materialId: 'ironOre', min: 1, max: 3, chance: 0.4 },
      { materialId: 'crystal', min: 1, max: 2, chance: 0.5 },
      { materialId: 'bone', min: 1, max: 3, chance: 0.5 },
      { materialId: 'mushroom', min: 1, max: 2, chance: 0.4 },
      { materialId: 'starMetal', min: 1, max: 1, chance: 0.1 },
      { materialId: 'moonpetal', min: 1, max: 1, chance: 0.1 },
    ],
    recipeChance: 0.15,
  },
];
