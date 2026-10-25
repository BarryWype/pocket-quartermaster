import type { DungeonDef, EncounterDef } from '@/game/types';

import { bossById } from './enemies';

// Five tiers of three dungeons, one per gear tier (wood → steel). The first two
// of a tier get gradually harder; the third holds the tier boss, which drops the
// pickaxe that opens the next tier's material. A tier shows up once the
// previous tier's boss has been beaten.
// A run is a series of encounters drawn from the dungeon's pool, then its boss.
// Tuned against src/game/balance/balance.test.ts.

type Trap = Extract<EncounterDef, { type: 'trap' }>;

/** The usual mix: three fights from the dungeon's enemies (weakest first), its trap and the shared events. */
function encounterPool([weak, normal, tough]: string[], trap: Omit<Trap, 'type' | 'weight'>): EncounterDef[] {
  return [
    { type: 'fight', weight: 3, mobs: [{ mobId: weak, count: 3 }] },
    { type: 'fight', weight: 3, mobs: [{ mobId: weak, count: 1 }, { mobId: normal, count: 2 }] },
    { type: 'fight', weight: 2, mobs: [{ mobId: tough, count: 1 }, { mobId: normal, count: 1 }] },
    { type: 'trap', weight: 2, ...trap },
    { type: 'event', weight: 1, eventId: 'spring' },
    { type: 'event', weight: 1, eventId: 'cache' },
    { type: 'event', weight: 1, eventId: 'ambush' },
  ];
}

const TRAP = { triggerChance: 0.6, avoidedBy: 'spotTraps' };

export const dungeons: DungeonDef[] = [
  // Tier 1: wood
  {
    id: 'ratCellar',
    name: 'Rat Cellar',
    emoji: '🐀',
    tier: 1,
    durationMinutes: 5,
    encounterCount: [4, 5],
    encounters: encounterPool(['giantRat', 'cellarSpider', 'ratSwarm'], {
      ...TRAP,
      name: 'rusty snare',
      targets: 'one',
      damagePct: 0.15,
    }),
    boss: bossById.ratKing,
    gold: [5, 12],
    xp: 30,
    durabilityLoss: [1, 3],
    loot: [
      { materialId: 'wood', min: 2, max: 4, chance: 0.8 },
      { materialId: 'hide', min: 1, max: 2, chance: 0.5 },
      { materialId: 'meat', min: 1, max: 2, chance: 0.4 },
    ],
    recipeDrops: [
      { recipeId: 'woodArmour', chance: 0.4 },
      { recipeId: 'woodWand', chance: 0.25 },
    ],
  },
  {
    id: 'goblinWarren',
    name: 'Goblin Warren',
    emoji: '👺',
    tier: 1,
    durationMinutes: 15,
    encounterCount: [5, 6],
    encounters: encounterPool(['caveRat', 'goblin', 'goblinSlinger'], {
      ...TRAP,
      name: 'spike pit',
      targets: 'one',
      damagePct: 0.15,
    }),
    boss: bossById.goblinChief,
    gold: [8, 18],
    xp: 50,
    durabilityLoss: [1, 3],
    loot: [
      { materialId: 'hide', min: 1, max: 3, chance: 0.7 },
      { materialId: 'bone', min: 1, max: 2, chance: 0.5 },
      { materialId: 'wood', min: 1, max: 3, chance: 0.4 },
    ],
    recipeDrops: [
      { recipeId: 'woodBow', chance: 0.4 },
      { recipeId: 'woodWand', chance: 0.25 },
    ],
  },
  {
    id: 'banditStockade',
    name: 'Bandit Stockade',
    emoji: '🏚️',
    tier: 1,
    isBoss: true,
    durationMinutes: 30,
    encounterCount: [6, 8],
    encounters: encounterPool(['guardDog', 'bandit', 'banditArcher'], {
      ...TRAP,
      name: 'tripwire volley',
      targets: 'all',
      damagePct: 0.08,
    }),
    boss: bossById.banditCaptain,
    gold: [20, 40],
    xp: 100,
    durabilityLoss: [2, 4],
    loot: [
      { materialId: 'wood', min: 3, max: 5, chance: 0.7 },
      { materialId: 'stone', min: 2, max: 3, chance: 0.6 },
      { materialId: 'hide', min: 1, max: 2, chance: 0.5 },
    ],
    recipeDrops: [
      { recipeId: 'woodPickaxe', chance: 1 },
      { recipeId: 'woodArmour', chance: 0.3 },
    ],
  },
  // Tier 2: stone
  {
    id: 'wolfDen',
    name: 'Wolf Den',
    emoji: '🐺',
    tier: 2,
    durationMinutes: 10,
    encounterCount: [4, 5],
    encounters: encounterPool(['wolfPup', 'greyWolf', 'direWolf'], {
      ...TRAP,
      name: 'rockslide',
      targets: 'all',
      damagePct: 0.08,
    }),
    boss: bossById.alphaWolf,
    gold: [12, 25],
    xp: 80,
    durabilityLoss: [2, 4],
    loot: [
      { materialId: 'hide', min: 2, max: 3, chance: 0.7 },
      { materialId: 'bone', min: 1, max: 3, chance: 0.6 },
      { materialId: 'meat', min: 1, max: 2, chance: 0.5 },
    ],
    recipeDrops: [
      { recipeId: 'stoneArmour', chance: 0.4 },
      { recipeId: 'stoneWand', chance: 0.25 },
    ],
  },
  {
    id: 'trollBridge',
    name: 'Troll Bridge',
    emoji: '🌉',
    tier: 2,
    durationMinutes: 30,
    encounterCount: [5, 6],
    encounters: encounterPool(['bogHound', 'highwayBandit', 'riverTroll'], {
      ...TRAP,
      name: 'rotten plank',
      targets: 'one',
      damagePct: 0.15,
    }),
    boss: bossById.bridgeTroll,
    gold: [18, 35],
    xp: 120,
    durabilityLoss: [2, 4],
    loot: [
      { materialId: 'stone', min: 2, max: 4, chance: 0.7 },
      { materialId: 'wood', min: 2, max: 3, chance: 0.5 },
      { materialId: 'herb', min: 1, max: 2, chance: 0.3 },
    ],
    recipeDrops: [
      { recipeId: 'stoneBow', chance: 0.4 },
      { recipeId: 'fireResistanceElixir', chance: 0.3 },
      { recipeId: 'stoneWand', chance: 0.25 },
    ],
  },
  {
    id: 'ogreQuarry',
    name: 'Ogre Quarry',
    emoji: '👹',
    tier: 2,
    isBoss: true,
    durationMinutes: 60,
    encounterCount: [6, 8],
    encounters: encounterPool(['ogreBrute', 'rockGolem', 'quarryOgre'], {
      ...TRAP,
      name: 'falling boulders',
      targets: 'all',
      damagePct: 0.1,
    }),
    boss: bossById.ogreChieftain,
    gold: [45, 85],
    xp: 220,
    durabilityLoss: [3, 5],
    loot: [
      { materialId: 'stone', min: 3, max: 5, chance: 0.8 },
      { materialId: 'copper', min: 1, max: 2, chance: 0.4 },
      { materialId: 'bone', min: 2, max: 3, chance: 0.5 },
    ],
    recipeDrops: [
      { recipeId: 'stonePickaxe', chance: 1 },
      { recipeId: 'fireResistanceElixir', chance: 0.2 },
      { recipeId: 'stoneArmour', chance: 0.3 },
    ],
  },
  // Tier 3: copper
  {
    id: 'hauntedMine',
    name: 'Haunted Mine',
    emoji: '👻',
    tier: 3,
    durationMinutes: 20,
    encounterCount: [4, 5],
    encounters: encounterPool(['caveBat', 'skeletonMiner', 'mineGhost'], {
      ...TRAP,
      name: 'collapsing tunnel',
      targets: 'all',
      damagePct: 0.1,
    }),
    boss: bossById.mineWraith,
    gold: [25, 50],
    xp: 150,
    durabilityLoss: [3, 5],
    loot: [
      { materialId: 'copper', min: 2, max: 4, chance: 0.7 },
      { materialId: 'stone', min: 2, max: 3, chance: 0.5 },
    ],
    recipeDrops: [
      { recipeId: 'copperArmour', chance: 0.4 },
      { recipeId: 'copperWand', chance: 0.25 },
    ],
  },
  {
    id: 'cinderHollow',
    name: 'Cinder Hollow',
    emoji: '🌋',
    tier: 3,
    durationMinutes: 45,
    encounterCount: [5, 6],
    encounters: encounterPool(['fireImp', 'magmaSlug', 'emberHound'], {
      ...TRAP,
      name: 'lava vent',
      targets: 'all',
      damagePct: 0.08,
      element: 'fire',
    }),
    boss: bossById.ashWyrm,
    gold: [40, 75],
    xp: 220,
    durabilityLoss: [3, 5],
    loot: [
      { materialId: 'copper', min: 1, max: 3, chance: 0.5 },
      { materialId: 'hide', min: 2, max: 3, chance: 0.5 },
      { materialId: 'mushroom', min: 1, max: 2, chance: 0.4 },
    ],
    recipeDrops: [
      { recipeId: 'copperBow', chance: 0.4 },
      { recipeId: 'copperWand', chance: 0.25 },
    ],
  },
  {
    id: 'drownedCrypt',
    name: 'Drowned Crypt',
    emoji: '⚰️',
    tier: 3,
    isBoss: true,
    durationMinutes: 90,
    encounterCount: [6, 8],
    encounters: encounterPool(['cryptEel', 'drownedDead', 'boneKnight'], {
      ...TRAP,
      name: 'poison dart trap',
      targets: 'one',
      damagePct: 0.15,
    }),
    boss: bossById.lichOfTheDeep,
    gold: [95, 180],
    xp: 400,
    durabilityLoss: [4, 6],
    loot: [
      { materialId: 'copper', min: 3, max: 5, chance: 0.7 },
      { materialId: 'iron', min: 1, max: 2, chance: 0.4 },
      { materialId: 'bone', min: 2, max: 4, chance: 0.5 },
    ],
    recipeDrops: [
      { recipeId: 'copperPickaxe', chance: 1 },
      { recipeId: 'copperArmour', chance: 0.3 },
    ],
  },
  // Tier 4: iron
  {
    id: 'harpyCliffs',
    name: 'Harpy Cliffs',
    emoji: '🦅',
    tier: 4,
    durationMinutes: 30,
    encounterCount: [4, 5],
    encounters: encounterPool(['rockLizard', 'cliffEagle', 'harpy'], {
      ...TRAP,
      name: 'crumbling ledge',
      targets: 'one',
      damagePct: 0.15,
    }),
    boss: bossById.harpyMatriarch,
    gold: [55, 105],
    xp: 250,
    durabilityLoss: [4, 6],
    loot: [
      { materialId: 'hide', min: 2, max: 4, chance: 0.6 },
      { materialId: 'bone', min: 2, max: 4, chance: 0.6 },
      { materialId: 'iron', min: 1, max: 2, chance: 0.4 },
    ],
    recipeDrops: [
      { recipeId: 'ironArmour', chance: 0.4 },
      { recipeId: 'ironWand', chance: 0.25 },
    ],
  },
  {
    id: 'orcWarcamp',
    name: 'Orc Warcamp',
    emoji: '🪓',
    tier: 4,
    durationMinutes: 60,
    encounterCount: [5, 6],
    encounters: encounterPool(['warBoar', 'orcRaider', 'orcShaman'], {
      ...TRAP,
      name: 'bear trap',
      targets: 'one',
      damagePct: 0.15,
    }),
    boss: bossById.orcWarlord,
    gold: [85, 160],
    xp: 350,
    durabilityLoss: [4, 6],
    loot: [
      { materialId: 'iron', min: 2, max: 4, chance: 0.7 },
      { materialId: 'wood', min: 2, max: 4, chance: 0.5 },
      { materialId: 'hide', min: 1, max: 3, chance: 0.4 },
    ],
    recipeDrops: [
      { recipeId: 'ironBow', chance: 0.4 },
      { recipeId: 'ironWand', chance: 0.25 },
    ],
  },
  {
    id: 'giantsHall',
    name: "Giant's Hall",
    emoji: '🏰',
    tier: 4,
    isBoss: true,
    durationMinutes: 120,
    encounterCount: [6, 8],
    encounters: encounterPool(['giantHound', 'stoneSentinel', 'hillGiant'], {
      ...TRAP,
      name: 'rolling boulder',
      targets: 'all',
      damagePct: 0.1,
    }),
    boss: bossById.giantKing,
    gold: [200, 380],
    xp: 600,
    durabilityLoss: [5, 7],
    loot: [
      { materialId: 'iron', min: 3, max: 5, chance: 0.7 },
      { materialId: 'coal', min: 2, max: 4, chance: 0.6 },
      { materialId: 'steel', min: 1, max: 1, chance: 0.3 },
    ],
    recipeDrops: [
      { recipeId: 'ironPickaxe', chance: 1 },
      { recipeId: 'ironArmour', chance: 0.3 },
    ],
  },
  // Tier 5: steel
  {
    id: 'wyvernPeaks',
    name: 'Wyvern Peaks',
    emoji: '🏔️',
    tier: 5,
    durationMinutes: 45,
    encounterCount: [4, 5],
    encounters: encounterPool(['frostWolf', 'mountainTroll', 'wyvern'], {
      ...TRAP,
      name: 'avalanche',
      targets: 'all',
      damagePct: 0.1,
    }),
    boss: bossById.wyvernQueen,
    gold: [115, 220],
    xp: 400,
    durabilityLoss: [5, 8],
    loot: [
      { materialId: 'hide', min: 3, max: 5, chance: 0.6 },
      { materialId: 'bone', min: 3, max: 5, chance: 0.6 },
      { materialId: 'steel', min: 1, max: 2, chance: 0.3 },
    ],
    recipeDrops: [
      { recipeId: 'steelArmour', chance: 0.4 },
      { recipeId: 'steelWand', chance: 0.25 },
    ],
  },
  {
    id: 'ashenCitadel',
    name: 'Ashen Citadel',
    emoji: '🔥',
    tier: 5,
    durationMinutes: 90,
    encounterCount: [5, 6],
    encounters: encounterPool(['flameCultist', 'cinderGolem', 'ashKnight'], {
      ...TRAP,
      name: 'flame jet',
      targets: 'all',
      damagePct: 0.08,
      element: 'fire',
    }),
    boss: bossById.ashLord,
    gold: [180, 340],
    xp: 550,
    durabilityLoss: [5, 8],
    loot: [
      { materialId: 'coal', min: 3, max: 5, chance: 0.6 },
      { materialId: 'iron', min: 3, max: 5, chance: 0.6 },
      { materialId: 'steel', min: 1, max: 2, chance: 0.3 },
    ],
    recipeDrops: [
      { recipeId: 'steelBow', chance: 0.4 },
      { recipeId: 'steelWand', chance: 0.25 },
    ],
  },
  {
    id: 'dragonLair',
    name: "Dragon's Lair",
    emoji: '🐉',
    tier: 5,
    isBoss: true,
    durationMinutes: 180,
    encounterCount: [6, 8],
    encounters: encounterPool(['dragonCultist', 'drake', 'fireElemental'], {
      ...TRAP,
      name: 'dragonfire vent',
      targets: 'all',
      damagePct: 0.1,
      element: 'fire',
    }),
    boss: bossById.elderDragon,
    gold: [420, 800],
    xp: 900,
    durabilityLoss: [6, 9],
    loot: [
      { materialId: 'steel', min: 2, max: 3, chance: 0.6 },
      { materialId: 'iron', min: 4, max: 6, chance: 0.6 },
      { materialId: 'coal', min: 3, max: 5, chance: 0.5 },
    ],
    recipeDrops: [
      { recipeId: 'steelPickaxe', chance: 1 },
      { recipeId: 'steelArmour', chance: 0.3 },
    ],
  },
];

export const expeditionRules = {
  /** Defense divisor: damage taken = incoming × 100 / (100 + defenseFactor × defense). */
  defenseFactor: 4,
  /** Every hit varies by up to ±this share. */
  damageVariance: 0.2,
  /**
   * Per-run luck: the party deals up to ±this share more or less damage and
   * takes the inverse. Keeps odds gradual between weak and strong teams.
   */
  fortune: 0.25,
  critChance: 0.1,
  critMultiplier: 1.5,
  /** Damage multiplier from an element the target is not protected against. */
  elementMultiplier: 1.5,
  /** Potions are drunk when their hero falls below this share of max HP. */
  potionThreshold: 0.35,
  /** Enraged bosses hit this much harder below half HP. */
  enrageMultiplier: 1.5,
  /** A sweeping boss hits every hero for this share of its damage. */
  sweepShare: 0.6,
  /** Chance per run of a mishap that ends it early, whatever the team's strength. */
  mishapChance: 0.03,
  mishaps: ['cave-in', 'flash flood', 'lost trail', 'rockfall'],
  /** A fight still going after this many rounds counts as lost. */
  maxRounds: 40,
  /** Extra durability loss when the boss is not beaten. */
  failureWearMultiplier: 1.5,
  /** Gear below this share of max durability shows up as cracked in the log. */
  crackedThreshold: 0.3,
  reportsKept: 20,
};
