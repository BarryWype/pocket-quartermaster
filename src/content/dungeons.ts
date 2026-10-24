import type { DungeonDef } from '@/game/types';

export const dungeons: DungeonDef[] = [
  {
    id: 'goblinWarren',
    name: 'Goblin Warren',
    emoji: '👺',
    durationMinutes: 5,
    difficulty: 35,
    enemies: ['goblin', 'goblin slinger', 'cave rat'],
    boss: 'goblin chief',
    gold: [8, 20],
    xp: 40,
    durabilityLoss: [2, 4],
    loot: [
      { materialId: 'ironOre', min: 1, max: 3, chance: 0.7 },
      { materialId: 'copperOre', min: 1, max: 2, chance: 0.5 },
      { materialId: 'hide', min: 1, max: 2, chance: 0.4 },
    ],
    recipeDrops: [{ recipeId: 'fireResistanceElixir', chance: 0.1 }],
  },
  {
    id: 'trollBridge',
    name: 'Troll Bridge',
    emoji: '🌉',
    durationMinutes: 30,
    difficulty: 75,
    enemies: ['bandit', 'river troll', 'bog hound'],
    boss: 'bridge troll',
    gold: [35, 70],
    xp: 120,
    durabilityLoss: [4, 7],
    loot: [
      { materialId: 'bone', min: 2, max: 4, chance: 0.7 },
      { materialId: 'crystal', min: 1, max: 2, chance: 0.4 },
      { materialId: 'ironOre', min: 2, max: 4, chance: 0.5 },
      { materialId: 'moonpetal', min: 1, max: 1, chance: 0.1 },
    ],
    recipeDrops: [
      { recipeId: 'fireResistanceElixir', chance: 0.3 },
      { recipeId: 'moonweaveCloak', chance: 0.15 },
    ],
  },
  {
    id: 'cinderHollow',
    name: 'Cinder Hollow',
    emoji: '🌋',
    durationMinutes: 120,
    difficulty: 140,
    hazard: 'fire',
    enemies: ['fire imp', 'ember hound', 'magma slug'],
    boss: 'ash wyrm',
    gold: [120, 250],
    xp: 350,
    durabilityLoss: [6, 10],
    loot: [
      { materialId: 'crystal', min: 2, max: 4, chance: 0.7 },
      { materialId: 'starMetal', min: 1, max: 1, chance: 0.35 },
      { materialId: 'moonpetal', min: 1, max: 1, chance: 0.25 },
    ],
    recipeDrops: [
      { recipeId: 'starforgedBlade', chance: 0.35 },
      { recipeId: 'moonweaveCloak', chance: 0.25 },
    ],
  },
];

export const expeditionRules = {
  /** Share of XP heroes still get when an expedition fails. */
  failureXpShare: 0.4,
  /** Extra durability loss on failure. */
  failureWearMultiplier: 1.5,
  /** Power multiplier for heroes facing a hazard they are not protected against. */
  hazardPenalty: 0.7,
  /** How strongly the power/difficulty ratio moves the success chance. */
  steepness: 4,
  minSuccessChance: 0.05,
  maxSuccessChance: 0.95,
  /** Gear below this share of max durability shows up as cracked in the log. */
  crackedThreshold: 0.3,
  reportsKept: 20,
};
