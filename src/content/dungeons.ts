import type { DungeonDef } from '@/game/types';

// One dungeon per forge tier. The first clear of each of the first three
// dungeons teaches the next pickaxe, which opens the next ore on the map:
// Goblin Warren → copper pickaxe (iron), Troll Bridge → iron pickaxe (coal),
// Collapsed Mine → steel pickaxe (bonus yield).
// Difficulty targets (see balance.test.ts): each dungeon is a coin flip for a
// team geared one tier below the one that clears it comfortably.
export const dungeons: DungeonDef[] = [
  {
    id: 'goblinWarren',
    name: 'Goblin Warren',
    emoji: '👺',
    durationMinutes: 5,
    difficulty: 38,
    enemies: ['goblin', 'goblin slinger', 'cave rat'],
    boss: 'goblin chief',
    gold: [8, 20],
    xp: 40,
    durabilityLoss: [1, 3],
    loot: [
      { materialId: 'wood', min: 2, max: 4, chance: 0.7 },
      { materialId: 'stone', min: 1, max: 3, chance: 0.6 },
      { materialId: 'hide', min: 1, max: 2, chance: 0.4 },
    ],
    recipeDrops: [{ recipeId: 'copperPickaxe', chance: 1 }],
  },
  {
    id: 'trollBridge',
    name: 'Troll Bridge',
    emoji: '🌉',
    durationMinutes: 20,
    difficulty: 85,
    enemies: ['bandit', 'river troll', 'bog hound'],
    boss: 'bridge troll',
    gold: [30, 60],
    xp: 100,
    durabilityLoss: [2, 5],
    loot: [
      { materialId: 'copperOre', min: 2, max: 4, chance: 0.7 },
      { materialId: 'bone', min: 1, max: 3, chance: 0.6 },
      { materialId: 'crystal', min: 1, max: 1, chance: 0.4 },
    ],
    recipeDrops: [
      { recipeId: 'ironPickaxe', chance: 1 },
      { recipeId: 'fireResistanceElixir', chance: 0.25 },
    ],
  },
  {
    id: 'collapsedMine',
    name: 'Collapsed Mine',
    emoji: '🕳️',
    durationMinutes: 60,
    difficulty: 120,
    enemies: ['kobold miner', 'rock crawler', 'cave bat'],
    boss: 'stone golem',
    gold: [70, 140],
    xp: 200,
    durabilityLoss: [3, 6],
    loot: [
      { materialId: 'ironOre', min: 2, max: 4, chance: 0.7 },
      { materialId: 'coal', min: 1, max: 3, chance: 0.6 },
      { materialId: 'crystal', min: 1, max: 2, chance: 0.5 },
    ],
    recipeDrops: [
      { recipeId: 'steelPickaxe', chance: 1 },
      { recipeId: 'fireResistanceElixir', chance: 0.4 },
    ],
  },
  {
    id: 'cinderHollow',
    name: 'Cinder Hollow',
    emoji: '🌋',
    durationMinutes: 120,
    difficulty: 175,
    hazard: 'fire',
    enemies: ['fire imp', 'ember hound', 'magma slug'],
    boss: 'ash wyrm',
    gold: [120, 250],
    xp: 350,
    durabilityLoss: [4, 8],
    loot: [
      { materialId: 'coal', min: 2, max: 4, chance: 0.7 },
      { materialId: 'crystal', min: 2, max: 3, chance: 0.6 },
      { materialId: 'starMetal', min: 1, max: 1, chance: 0.35 },
    ],
    recipeDrops: [
      { recipeId: 'moonweaveCloak', chance: 0.3 },
      { recipeId: 'starforgedBlade', chance: 0.15 },
    ],
  },
  {
    id: 'wyrmSpire',
    name: "Wyrm's Spire",
    emoji: '🐉',
    durationMinutes: 240,
    difficulty: 225,
    enemies: ['drake', 'wyrm cultist', 'storm harpy'],
    boss: 'elder wyrm',
    gold: [250, 500],
    xp: 600,
    durabilityLoss: [5, 10],
    loot: [
      { materialId: 'ironOre', min: 3, max: 6, chance: 0.6 },
      { materialId: 'crystal', min: 2, max: 4, chance: 0.7 },
      { materialId: 'starMetal', min: 1, max: 1, chance: 0.6 },
      { materialId: 'moonpetal', min: 1, max: 1, chance: 0.4 },
    ],
    recipeDrops: [
      { recipeId: 'starforgedBlade', chance: 0.4 },
      { recipeId: 'moonweaveCloak', chance: 0.3 },
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
