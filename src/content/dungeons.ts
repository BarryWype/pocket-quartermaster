import type { DungeonDef, EncounterDef, ObstacleKind } from '@/game/types';

import { bossById } from './enemies';

// Five tiers, one per gear tier (wood → steel). Each tier has a fixed boss
// dungeon, which drops the pickaxe that opens the next tier's material, and a
// pool of regular dungeons: three `short` (farm) and three `long` ones. Each day
// one of each is open (see game/dungeons/rotation.ts). A tier shows up once the
// previous tier's boss has been beaten.
// A run is a series of encounters drawn from the dungeon's pool, then its boss.
// Regular dungeons of a slot share their tier's rewards: main reward chance 30%
// for short, 75% for long; 100% plus a 50% second roll for the boss.
// Tuned against src/game/balance/balance.test.ts.

type Trap = Extract<EncounterDef, { type: 'trap' }>;

/** The usual mix: three fights from the dungeon's enemies (weakest first), its trap, the shared events and any extras. */
function encounterPool(
  [weak, normal, tough]: string[],
  trap: Omit<Trap, 'type' | 'weight'>,
  extras: EncounterDef[] = [],
): EncounterDef[] {
  return [
    { type: 'fight', weight: 3, mobs: [{ mobId: weak, count: 3 }] },
    { type: 'fight', weight: 3, mobs: [{ mobId: weak, count: 1 }, { mobId: normal, count: 2 }] },
    { type: 'fight', weight: 2, mobs: [{ mobId: tough, count: 1 }, { mobId: normal, count: 1 }] },
    { type: 'trap', weight: 2, ...trap },
    { type: 'event', weight: 1, eventId: 'spring' },
    { type: 'event', weight: 1, eventId: 'cache' },
    { type: 'event', weight: 1, eventId: 'ambush' },
    ...extras,
  ];
}

const TRAP = { triggerChance: 0.6 };

/** A blocked way: solved by a hero who can, otherwise it tires everyone and may force a detour fight. */
const obstacle = (kind: ObstacleKind, name: string, weight = 2): EncounterDef => ({
  type: 'obstacle',
  weight,
  name,
  kind,
  hpCostPct: 0.06,
  detourChance: 0.35,
});

const locals = (npcId: string, weight = 1): EncounterDef => ({ type: 'locals', weight, npcId });

/** Blueprints of the newer weapon types; they only drop for types the player has met (see expeditions.ts). */
const extraDrops = (material: string, slot: 'short' | 'long') =>
  (slot === 'short' ? ['Axe', 'Dagger', 'Staff'] : ['Mace', 'Lute']).map((suffix) => ({
    recipeId: `${material}${suffix}`,
    chance: 0.15,
  }));

/** A new pool dungeon with the rewards of an existing one of the same tier and slot. */
const sameRewards = (base: DungeonDef) => ({
  tier: base.tier,
  slot: base.slot,
  durationMinutes: base.durationMinutes,
  encounterCount: base.encounterCount,
  mainRewardChance: base.mainRewardChance,
  gold: base.gold,
  xp: base.xp,
  loot: base.loot,
  recipeDrops: base.recipeDrops,
});

// Tier 1: wood
const ratCellar: DungeonDef = {
  id: 'ratCellar',
  name: 'Rat Cellar',
  emoji: '🐀',
  tier: 1,
  slot: 'short',
  durationMinutes: 5,
  encounterCount: [4, 5],
  encounters: encounterPool(['giantRat', 'cellarSpider', 'ratSwarm'], {
    ...TRAP,
    name: 'rusty snare',
    targets: 'one',
    damagePct: 0.15,
  }),
  boss: bossById.ratKing,
  mainRewardChance: 0.3,
  gold: [5, 12],
  xp: 30,
  loot: [
    { materialId: 'wood', min: 2, max: 4, chance: 0.8 },
    { materialId: 'hide', min: 1, max: 2, chance: 0.5 },
    { materialId: 'meat', min: 1, max: 2, chance: 0.4 },
  ],
  recipeDrops: [
    { recipeId: 'woodArmour', chance: 0.4 },
    { recipeId: 'woodWand', chance: 0.25 },
    ...extraDrops('wood', 'short'),
  ],
};
const goblinWarren: DungeonDef = {
  id: 'goblinWarren',
  name: 'Goblin Warren',
  emoji: '👺',
  tier: 1,
  slot: 'long',
  durationMinutes: 15,
  encounterCount: [5, 6],
  encounters: encounterPool(
    ['goblinRunt', 'goblin', 'goblinSlinger'],
    { ...TRAP, name: 'spike pit', targets: 'one', damagePct: 0.15 },
    [obstacle('barricade', 'junk barricade', 3), obstacle('rubble', 'caved-in tunnel')],
  ),
  boss: bossById.goblinChief,
  mainRewardChance: 0.75,
  gold: [8, 18],
  xp: 50,
  loot: [
    { materialId: 'hide', min: 1, max: 3, chance: 0.7 },
    { materialId: 'bone', min: 1, max: 2, chance: 0.5 },
    { materialId: 'wood', min: 1, max: 3, chance: 0.4 },
  ],
  recipeDrops: [
    { recipeId: 'woodBow', chance: 0.4 },
    { recipeId: 'woodWand', chance: 0.25 },
    ...extraDrops('wood', 'long'),
  ],
};
// Tier 2: stone
const wolfDen: DungeonDef = {
  id: 'wolfDen',
  name: 'Wolf Den',
  emoji: '🐺',
  tier: 2,
  slot: 'short',
  durationMinutes: 10,
  encounterCount: [4, 5],
  encounters: encounterPool(['wolfPup', 'greyWolf', 'direWolf'], {
    ...TRAP,
    name: 'rockslide',
    targets: 'all',
    damagePct: 0.08,
  }),
  boss: bossById.alphaWolf,
  mainRewardChance: 0.3,
  gold: [12, 25],
  xp: 80,
  loot: [
    { materialId: 'hide', min: 2, max: 3, chance: 0.7 },
    { materialId: 'bone', min: 1, max: 3, chance: 0.6 },
    { materialId: 'meat', min: 1, max: 2, chance: 0.5 },
  ],
  recipeDrops: [
    { recipeId: 'stoneArmour', chance: 0.4 },
    { recipeId: 'stoneWand', chance: 0.25 },
    ...extraDrops('stone', 'short'),
  ],
};
const trollBridge: DungeonDef = {
  id: 'trollBridge',
  name: 'Troll Bridge',
  emoji: '🌉',
  tier: 2,
  slot: 'long',
  durationMinutes: 30,
  encounterCount: [5, 6],
  encounters: encounterPool(
    ['bogHound', 'highwayBandit', 'riverTroll'],
    { ...TRAP, name: 'rotten plank', targets: 'one', damagePct: 0.15 },
    [locals('tollTroll', 2), locals('hermit', 3), locals('pedlar', 2), obstacle('rubble', 'collapsed arch', 1)],
  ),
  boss: bossById.bridgeTroll,
  mainRewardChance: 0.75,
  gold: [18, 35],
  xp: 120,
  loot: [
    { materialId: 'stone', min: 2, max: 4, chance: 0.7 },
    { materialId: 'wood', min: 2, max: 3, chance: 0.5 },
    { materialId: 'herb', min: 1, max: 2, chance: 0.3 },
  ],
  recipeDrops: [
    { recipeId: 'stoneBow', chance: 0.4 },
    { recipeId: 'fireResistanceElixir', chance: 0.3 },
    { recipeId: 'stoneWand', chance: 0.25 },
    ...extraDrops('stone', 'long'),
  ],
};
// Tier 3: copper
const hauntedMine: DungeonDef = {
  id: 'hauntedMine',
  name: 'Haunted Mine',
  emoji: '👻',
  tier: 3,
  slot: 'short',
  durationMinutes: 20,
  encounterCount: [4, 5],
  encounters: encounterPool(
    ['ghostBat', 'skeletonMiner', 'mineGhost'],
    { ...TRAP, name: 'collapsing tunnel', targets: 'all', damagePct: 0.1 },
    [locals('lostMiner')],
  ),
  boss: bossById.mineWraith,
  mainRewardChance: 0.3,
  gold: [25, 50],
  xp: 150,
  loot: [
    { materialId: 'copper', min: 2, max: 4, chance: 0.7 },
    { materialId: 'stone', min: 2, max: 3, chance: 0.5 },
  ],
  recipeDrops: [
    { recipeId: 'copperArmour', chance: 0.4 },
    { recipeId: 'copperWand', chance: 0.25 },
    ...extraDrops('copper', 'short'),
  ],
};
const cinderHollow: DungeonDef = {
  id: 'cinderHollow',
  name: 'Cinder Hollow',
  emoji: '🌋',
  tier: 3,
  slot: 'long',
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
  mainRewardChance: 0.75,
  gold: [40, 75],
  xp: 220,
  loot: [
    { materialId: 'copper', min: 1, max: 3, chance: 0.5 },
    { materialId: 'hide', min: 2, max: 3, chance: 0.5 },
    { materialId: 'mushroom', min: 1, max: 2, chance: 0.4 },
  ],
  recipeDrops: [
    { recipeId: 'copperBow', chance: 0.4 },
    { recipeId: 'copperWand', chance: 0.25 },
    ...extraDrops('copper', 'long'),
  ],
};
// Tier 4: iron
const harpyCliffs: DungeonDef = {
  id: 'harpyCliffs',
  name: 'Harpy Cliffs',
  emoji: '🦅',
  tier: 4,
  slot: 'short',
  durationMinutes: 30,
  encounterCount: [4, 5],
  encounters: encounterPool(
    ['rockLizard', 'cliffEagle', 'harpy'],
    { ...TRAP, name: 'crumbling ledge', targets: 'one', damagePct: 0.15 },
    [obstacle('rubble', 'fallen boulders', 1)],
  ),
  boss: bossById.harpyMatriarch,
  mainRewardChance: 0.3,
  gold: [55, 105],
  xp: 250,
  loot: [
    { materialId: 'hide', min: 2, max: 4, chance: 0.6 },
    { materialId: 'bone', min: 2, max: 4, chance: 0.6 },
    { materialId: 'iron', min: 1, max: 2, chance: 0.4 },
  ],
  recipeDrops: [
    { recipeId: 'ironArmour', chance: 0.4 },
    { recipeId: 'ironWand', chance: 0.25 },
    ...extraDrops('iron', 'short'),
  ],
};
const orcWarcamp: DungeonDef = {
  id: 'orcWarcamp',
  name: 'Orc Warcamp',
  emoji: '🪓',
  tier: 4,
  slot: 'long',
  durationMinutes: 60,
  encounterCount: [5, 6],
  encounters: encounterPool(
    ['orcGrunt', 'orcRaider', 'orcShaman'],
    { ...TRAP, name: 'bear trap', targets: 'one', damagePct: 0.15 },
    [obstacle('barricade', 'spiked barricade', 3), obstacle('locked', 'chained gate', 1)],
  ),
  boss: bossById.orcWarlord,
  mainRewardChance: 0.75,
  gold: [85, 160],
  xp: 350,
  loot: [
    { materialId: 'iron', min: 2, max: 4, chance: 0.7 },
    { materialId: 'wood', min: 2, max: 4, chance: 0.5 },
    { materialId: 'hide', min: 1, max: 3, chance: 0.4 },
  ],
  recipeDrops: [
    { recipeId: 'ironBow', chance: 0.4 },
    { recipeId: 'ironWand', chance: 0.25 },
    ...extraDrops('iron', 'long'),
  ],
};
// Tier 5: steel
const wyvernPeaks: DungeonDef = {
  id: 'wyvernPeaks',
  name: 'Wyvern Peaks',
  emoji: '🏔️',
  tier: 5,
  slot: 'short',
  durationMinutes: 45,
  encounterCount: [4, 5],
  encounters: encounterPool(
    ['frostWolf', 'mountainTroll', 'wyvern'],
    { ...TRAP, name: 'avalanche', targets: 'all', damagePct: 0.1 },
    [obstacle('rubble', 'snowed-in pass', 1)],
  ),
  boss: bossById.wyvernQueen,
  mainRewardChance: 0.3,
  gold: [115, 220],
  xp: 400,
  loot: [
    { materialId: 'hide', min: 3, max: 5, chance: 0.6 },
    { materialId: 'bone', min: 3, max: 5, chance: 0.6 },
    { materialId: 'steel', min: 1, max: 2, chance: 0.3 },
  ],
  recipeDrops: [
    { recipeId: 'steelArmour', chance: 0.4 },
    { recipeId: 'steelWand', chance: 0.25 },
    ...extraDrops('steel', 'short'),
  ],
};
const ashenCitadel: DungeonDef = {
  id: 'ashenCitadel',
  name: 'Ashen Citadel',
  emoji: '🔥',
  tier: 5,
  slot: 'long',
  durationMinutes: 90,
  encounterCount: [5, 6],
  encounters: encounterPool(
    ['flameCultist', 'cinderGolem', 'ashKnight'],
    { ...TRAP, name: 'flame jet', targets: 'all', damagePct: 0.08, element: 'fire' },
    [obstacle('barricade', 'smouldering barricade', 1), obstacle('locked', 'sealed citadel door', 1)],
  ),
  boss: bossById.ashLord,
  mainRewardChance: 0.75,
  gold: [180, 340],
  xp: 550,
  loot: [
    { materialId: 'coal', min: 3, max: 5, chance: 0.6 },
    { materialId: 'iron', min: 3, max: 5, chance: 0.6 },
    { materialId: 'steel', min: 1, max: 2, chance: 0.3 },
  ],
  recipeDrops: [
    { recipeId: 'steelBow', chance: 0.4 },
    { recipeId: 'steelWand', chance: 0.25 },
    ...extraDrops('steel', 'long'),
  ],
};

export const dungeons: DungeonDef[] = [
  // Tier 1: wood
  ratCellar,
  {
    ...sameRewards(ratCellar),
    id: 'spiderBurrow',
    name: 'Spider Burrow',
    emoji: '🕷️',
    encounters: encounterPool(
      ['webling', 'burrowSpider', 'broodGuard'],
      { ...TRAP, name: 'sticky web', targets: 'one', damagePct: 0.12 },
      [{ type: 'trap', weight: 4, ...TRAP, name: 'web snare', targets: 'all', damagePct: 0.06 }],
    ),
    boss: bossById.broodMother,
  },
  {
    ...sameRewards(ratCellar),
    id: 'oldGraveyard',
    name: 'Old Graveyard',
    emoji: '🪦',
    encounters: encounterPool(
      ['restlessBones', 'ghoul', 'ghoul'],
      { ...TRAP, name: 'open grave', targets: 'one', damagePct: 0.12 },
      [locals('hermit')],
    ),
    boss: bossById.graveLord,
  },
  goblinWarren,
  {
    ...sameRewards(goblinWarren),
    id: 'millRuins',
    name: 'Collapsed Mill',
    emoji: '🏚️',
    encounters: encounterPool(
      ['millRat', 'squatter', 'millBrute'],
      { ...TRAP, name: 'loose millstone', targets: 'one', damagePct: 0.15 },
      [obstacle('rubble', 'fallen beams', 3), obstacle('rubble', 'grain-choked stairs', 2), locals('pedlar')],
    ),
    boss: bossById.millOgre,
  },
  {
    ...sameRewards(goblinWarren),
    id: 'smugglersCove',
    name: 'Smugglers’ Cove',
    emoji: '🏴‍☠️',
    encounters: encounterPool(
      ['cutpurse', 'smuggler', 'coveEnforcer'],
      { ...TRAP, name: 'tripwire bell', targets: 'one', damagePct: 0.12 },
      [locals('pedlar', 4), locals('poachers', 3), obstacle('locked', 'smugglers’ hatch', 1)],
    ),
    boss: bossById.smugglerQueen,
  },
  {
    id: 'banditStockade',
    name: 'Bandit Stockade',
    emoji: '🏚️',
    tier: 1,
    isBoss: true,
    durationMinutes: 30,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['guardDog', 'bandit', 'banditArcher'],
      { ...TRAP, name: 'tripwire volley', targets: 'all', damagePct: 0.08 },
      [obstacle('barricade', 'palisade gate', 1)],
    ),
    boss: bossById.banditCaptain,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [20, 40],
    xp: 100,
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
  wolfDen,
  {
    ...sameRewards(wolfDen),
    id: 'barrowMounds',
    name: 'Barrow Mounds',
    emoji: '⚱️',
    encounters: encounterPool(
      ['barrowWight', 'barrowRat', 'mouldKnight'],
      { ...TRAP, name: 'sinking barrow', targets: 'one', damagePct: 0.15 },
      [{ type: 'fight', weight: 3, mobs: [{ mobId: 'barrowWight', count: 2 }, { mobId: 'mouldKnight', count: 1 }] }],
    ),
    boss: bossById.barrowKing,
  },
  {
    ...sameRewards(wolfDen),
    id: 'boarThicket',
    name: 'Boar Thicket',
    emoji: '🐗',
    encounters: encounterPool(
      ['thornPiglet', 'wildBoar', 'briarTusker'],
      { ...TRAP, name: 'bramble snare', targets: 'one', damagePct: 0.12, element: 'grass' },
      [locals('poachers')],
    ),
    boss: bossById.thicketBoar,
  },
  trollBridge,
  {
    ...sameRewards(trollBridge),
    id: 'sunkenFord',
    name: 'Sunken Ford',
    emoji: '🌊',
    encounters: encounterPool(
      ['fordLeech', 'riverSprite', 'drownedSoldier'],
      { ...TRAP, name: 'sudden current', targets: 'all', damagePct: 0.08, element: 'water' },
      [obstacle('rubble', 'silted crossing', 2)],
    ),
    boss: bossById.fordHag,
  },
  {
    ...sameRewards(trollBridge),
    id: 'watchtower',
    name: 'Abandoned Watchtower',
    emoji: '🗼',
    encounters: encounterPool(
      ['towerCrow', 'deserter', 'towerSergeant'],
      { ...TRAP, name: 'murder hole', targets: 'one', damagePct: 0.15 },
      [obstacle('barricade', 'barred stairwell', 3), obstacle('locked', 'armoury door', 2)],
    ),
    boss: bossById.turncoatKnight,
  },
  {
    id: 'ogreQuarry',
    name: 'Ogre Quarry',
    emoji: '👹',
    tier: 2,
    isBoss: true,
    durationMinutes: 60,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['ogreBrute', 'rockGolem', 'quarryOgre'],
      { ...TRAP, name: 'falling boulders', targets: 'all', damagePct: 0.15 },
      [obstacle('rubble', 'quarry rockfall', 3)],
    ),
    boss: bossById.ogreChieftain,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [45, 85],
    xp: 220,
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
  hauntedMine,
  {
    ...sameRewards(hauntedMine),
    id: 'fungalGrotto',
    name: 'Fungal Grotto',
    emoji: '🍄',
    encounters: encounterPool(
      ['sporeling', 'capCrawler', 'mycelTroll'],
      { ...TRAP, name: 'spore burst', targets: 'all', damagePct: 0.08, element: 'grass' },
    ),
    boss: bossById.sporeQueen,
  },
  {
    ...sameRewards(hauntedMine),
    id: 'stormRidge',
    name: 'Storm Ridge',
    emoji: '⚡',
    encounters: encounterPool(
      ['sparkMoth', 'stormHawk', 'boltElemental'],
      { ...TRAP, name: 'lightning rod', targets: 'one', damagePct: 0.15, element: 'electric' },
      [{ type: 'fight', weight: 2, mobs: [{ mobId: 'boltElemental', count: 2 }] }],
    ),
    boss: bossById.stormRoc,
  },
  cinderHollow,
  {
    ...sameRewards(cinderHollow),
    id: 'dwarfhold',
    name: 'Collapsed Dwarfhold',
    emoji: '⛏️',
    encounters: encounterPool(
      ['tunnelBeetle', 'stoneWarden', 'runeGolem'],
      { ...TRAP, name: 'rune ward', targets: 'all', damagePct: 0.08 },
      [obstacle('rubble', 'collapsed gallery', 3), obstacle('locked', 'dwarven vault door', 2), locals('lostMiner')],
    ),
    boss: bossById.forgeGuardian,
  },
  {
    ...sameRewards(cinderHollow),
    id: 'witchMarsh',
    name: 'Marsh Witch Hut',
    emoji: '🧙',
    encounters: encounterPool(
      ['marshToad', 'bogling', 'hexedHunter'],
      { ...TRAP, name: 'sucking bog', targets: 'one', damagePct: 0.15 },
      [locals('hermit', 3), locals('poachers', 2)],
    ),
    boss: bossById.marshWitch,
  },
  {
    id: 'drownedCrypt',
    name: 'Drowned Crypt',
    emoji: '⚰️',
    tier: 3,
    isBoss: true,
    durationMinutes: 90,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['cryptEel', 'drownedDead', 'boneKnight'],
      { ...TRAP, name: 'poison dart trap', targets: 'one', damagePct: 0.15 },
      [obstacle('locked', 'sealed crypt door', 1)],
    ),
    boss: bossById.lichOfTheDeep,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [95, 180],
    xp: 400,
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
  harpyCliffs,
  {
    ...sameRewards(harpyCliffs),
    id: 'thunderPlateau',
    name: 'Thunder Plateau',
    emoji: '🌩️',
    encounters: encounterPool(
      ['stormRam', 'thunderbird', 'skyfallGolem'],
      { ...TRAP, name: 'charged stones', targets: 'all', damagePct: 0.08, element: 'electric' },
    ),
    boss: bossById.thunderTitan,
  },
  {
    ...sameRewards(harpyCliffs),
    id: 'boneField',
    name: 'Bone Field',
    emoji: '💀',
    encounters: encounterPool(
      ['boneCrawler', 'fallenLegionary', 'deathCaptain'],
      { ...TRAP, name: 'grasping bones', targets: 'one', damagePct: 0.15 },
      [locals('hermit')],
    ),
    boss: bossById.boneGeneral,
  },
  orcWarcamp,
  {
    ...sameRewards(orcWarcamp),
    id: 'clockworkVault',
    name: 'Clockwork Vault',
    emoji: '⚙️',
    encounters: encounterPool(
      ['brassBeetle', 'clockworkGuard', 'vaultAutomaton'],
      { ...TRAP, name: 'swinging blade', targets: 'one', damagePct: 0.3 },
      [
        { type: 'trap', weight: 4, ...TRAP, name: 'gear crusher', targets: 'all', damagePct: 0.2 },
        { type: 'trap', weight: 3, ...TRAP, name: 'dart wall', targets: 'one', damagePct: 0.25 },
        obstacle('locked', 'tumbler door', 2),
      ],
    ),
    boss: bossById.clockworkWarden,
  },
  {
    ...sameRewards(orcWarcamp),
    id: 'frozenLake',
    name: 'Frozen Lake',
    emoji: '🧊',
    encounters: encounterPool(
      ['iceSeal', 'frostNymph', 'lakeSerpent'],
      { ...TRAP, name: 'thin ice', targets: 'one', damagePct: 0.15, element: 'water' },
      [{ type: 'fight', weight: 2, mobs: [{ mobId: 'frostNymph', count: 3 }] }],
    ),
    boss: bossById.iceWyrm,
  },
  {
    id: 'giantsHall',
    name: "Giant's Hall",
    emoji: '🏰',
    tier: 4,
    isBoss: true,
    durationMinutes: 120,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['giantHound', 'stoneSentinel', 'hillGiant'],
      { ...TRAP, name: 'rolling boulder', targets: 'all', damagePct: 0.1 },
      [obstacle('locked', 'giant-sized door', 1), obstacle('rubble', 'toppled pillar', 4)],
    ),
    boss: bossById.giantKing,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [200, 380],
    xp: 600,
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
  wyvernPeaks,
  {
    ...sameRewards(wyvernPeaks),
    id: 'ossuary',
    name: 'Ossuary of Kings',
    emoji: '👑',
    encounters: encounterPool(
      ['cryptGuard', 'boneLord', 'deathKnight'],
      { ...TRAP, name: 'collapsing reliquary', targets: 'all', damagePct: 0.08 },
      [obstacle('locked', 'royal tomb seal', 1)],
    ),
    boss: bossById.ossuaryKing,
  },
  {
    ...sameRewards(wyvernPeaks),
    id: 'stormIsle',
    name: 'Stormcaller Isle',
    emoji: '🌀',
    encounters: encounterPool(
      ['stormEel', 'tempestCaller', 'thunderDrake'],
      { ...TRAP, name: 'lightning strike', targets: 'one', damagePct: 0.15, element: 'electric' },
    ),
    boss: bossById.stormcaller,
  },
  ashenCitadel,
  {
    ...sameRewards(ashenCitadel),
    id: 'abyssalDepths',
    name: 'Abyssal Depths',
    emoji: '🐙',
    encounters: encounterPool(
      ['deepAngler', 'abyssalPriest', 'krakenSpawn'],
      { ...TRAP, name: 'crushing pressure', targets: 'all', damagePct: 0.08, element: 'water' },
      [{ type: 'fight', weight: 2, mobs: [{ mobId: 'abyssalPriest', count: 2 }] }],
    ),
    boss: bossById.abyssalHorror,
  },
  {
    ...sameRewards(ashenCitadel),
    id: 'titanRuins',
    name: 'Titan Ruins',
    emoji: '🗿',
    encounters: encounterPool(
      ['ruinCrawler', 'titanShard', 'colossusArm'],
      { ...TRAP, name: 'toppling statue', targets: 'all', damagePct: 0.1 },
      [obstacle('rubble', 'titan’s fallen hand', 3), obstacle('rubble', 'buried causeway', 2), locals('lostMiner')],
    ),
    boss: bossById.titanHeart,
  },
  {
    id: 'dragonLair',
    name: "Dragon's Lair",
    emoji: '🐉',
    tier: 5,
    isBoss: true,
    durationMinutes: 180,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['dragonCultist', 'drake', 'fireElemental'],
      { ...TRAP, name: 'dragonfire vent', targets: 'all', damagePct: 0.1, element: 'fire' },
      [obstacle('locked', 'hoard vault door', 1)],
    ),
    boss: bossById.elderDragon,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [420, 800],
    xp: 900,
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
  reportsKept: 20,
};
