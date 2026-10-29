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
// Gold per run doubles each tier: players collect once a session, so runs,
// not hours, set daily income. Dungeons pay gold, XP, main rewards and
// blueprints; materials come from walking, so `loot` stays empty for
// dungeon-only items later.
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

/** A blocked way: a quiet step now, there for the look of the dungeon. */
const obstacle = (kind: ObstacleKind, name: string, weight = 2): EncounterDef => ({
  type: 'obstacle',
  weight,
  name,
  kind,
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
    name: 'rusty snare',
    targets: 'one',
  }),
  boss: bossById.ratKing,
  mainRewardChance: 0.3,
  gold: [5, 12],
  xp: 30,
  loot: [],
  recipeDrops: [
    { recipeId: 'woodArmour', chance: 0.6 },
    { recipeId: 'woodWand', chance: 0.5 },
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
    { name: 'spike pit', targets: 'one' },
    [obstacle('barricade', 'junk barricade', 3), obstacle('rubble', 'caved-in tunnel')],
  ),
  boss: bossById.goblinChief,
  mainRewardChance: 0.75,
  gold: [8, 18],
  xp: 50,
  loot: [],
  recipeDrops: [
    { recipeId: 'woodBow', chance: 0.6 },
    { recipeId: 'woodWand', chance: 0.5 },
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
    name: 'rockslide',
    targets: 'all',
  }),
  boss: bossById.alphaWolf,
  mainRewardChance: 0.3,
  gold: [10, 24],
  xp: 80,
  loot: [],
  recipeDrops: [
    { recipeId: 'stoneArmour', chance: 0.6 },
    { recipeId: 'stoneWand', chance: 0.5 },
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
    { name: 'rotten plank', targets: 'one' },
    [locals('tollTroll', 2), locals('hermit', 3), locals('pedlar', 2), obstacle('rubble', 'collapsed arch', 1)],
  ),
  boss: bossById.bridgeTroll,
  mainRewardChance: 0.75,
  gold: [16, 36],
  xp: 120,
  loot: [],
  recipeDrops: [
    { recipeId: 'stoneBow', chance: 0.6 },
    { recipeId: 'emberWardSalve', chance: 0.3 },
    { recipeId: 'stoneWand', chance: 0.5 },
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
    { name: 'collapsing tunnel', targets: 'all' },
    [locals('lostMiner')],
  ),
  boss: bossById.mineWraith,
  mainRewardChance: 0.3,
  gold: [20, 48],
  xp: 150,
  loot: [],
  recipeDrops: [
    { recipeId: 'copperArmour', chance: 0.6 },
    { recipeId: 'copperWand', chance: 0.5 },
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
    name: 'lava vent',
    targets: 'all',
    element: 'fire',
  }),
  boss: bossById.ashWyrm,
  mainRewardChance: 0.75,
  gold: [32, 72],
  xp: 220,
  loot: [],
  recipeDrops: [
    { recipeId: 'copperBow', chance: 0.6 },
    { recipeId: 'copperWand', chance: 0.5 },
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
    { name: 'crumbling ledge', targets: 'one' },
    [obstacle('rubble', 'fallen boulders', 1)],
  ),
  boss: bossById.harpyMatriarch,
  mainRewardChance: 0.3,
  gold: [40, 96],
  xp: 250,
  loot: [],
  recipeDrops: [
    { recipeId: 'ironArmour', chance: 0.6 },
    { recipeId: 'ironWand', chance: 0.5 },
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
    { name: 'bear trap', targets: 'one' },
    [obstacle('barricade', 'spiked barricade', 3), obstacle('locked', 'chained gate', 1)],
  ),
  boss: bossById.orcWarlord,
  mainRewardChance: 0.75,
  gold: [64, 144],
  xp: 350,
  loot: [],
  recipeDrops: [
    { recipeId: 'ironBow', chance: 0.6 },
    { recipeId: 'ironWand', chance: 0.5 },
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
    { name: 'avalanche', targets: 'all' },
    [obstacle('rubble', 'snowed-in pass', 1)],
  ),
  boss: bossById.wyvernQueen,
  mainRewardChance: 0.3,
  gold: [80, 192],
  xp: 400,
  loot: [],
  recipeDrops: [
    { recipeId: 'steelArmour', chance: 0.6 },
    { recipeId: 'steelWand', chance: 0.5 },
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
    { name: 'flame jet', targets: 'all', element: 'fire' },
    [obstacle('barricade', 'smouldering barricade', 1), obstacle('locked', 'sealed citadel door', 1)],
  ),
  boss: bossById.ashLord,
  mainRewardChance: 0.75,
  gold: [128, 288],
  xp: 550,
  loot: [],
  recipeDrops: [
    { recipeId: 'steelBow', chance: 0.6 },
    { recipeId: 'steelWand', chance: 0.5 },
    ...extraDrops('steel', 'long'),
  ],
};

/**
 * Overnight quests: one per tier, open every day alongside the rotation and
 * unlocked with its tier. A long, safe patrol for players who won't be back
 * for hours: it pays about `goldRunsWorth`/`xpRunsWorth` short runs of the tier, counted as
 * `supplyHours` of supply per hero, and is the only dungeon with `overnight`.
 */
export const overnightQuestRules = {
  /** Hours a patrol takes. */
  durationHours: 8,
  /** Gold for about this many of the tier's short runs. */
  goldRunsWorth: 3,
  /** XP for about this many of the tier's short runs. */
  xpRunsWorth: 3,
  /** Supply points per hero: a patrol is counted as this many started hours. */
  supplyHours: 3,
};

/** The tier's overnight quest: the short dungeon's easiest mobs, a mild trap and a patrol leader. */
function nightQuest(
  id: string,
  name: string,
  emoji: string,
  base: DungeonDef,
  [weak, normal]: string[],
  trap: Omit<Trap, 'type' | 'weight'>,
  bossId: string,
): DungeonDef {
  const { goldRunsWorth, xpRunsWorth } = overnightQuestRules;
  return {
    id,
    name,
    emoji,
    tier: base.tier,
    overnight: true,
    durationMinutes: overnightQuestRules.durationHours * 60,
    encounterCount: [4, 5],
    encounters: [
      { type: 'fight', weight: 3, mobs: [{ mobId: weak, count: 2 }] },
      { type: 'fight', weight: 3, mobs: [{ mobId: normal, count: 1 }] },
      { type: 'trap', weight: 2, ...trap },
      { type: 'event', weight: 1, eventId: 'spring' },
      { type: 'event', weight: 1, eventId: 'cache' },
    ],
    boss: bossById[bossId],
    mainRewardChance: base.mainRewardChance,
    gold: [base.gold[0] * goldRunsWorth, base.gold[1] * goldRunsWorth],
    xp: base.xp * xpRunsWorth,
    loot: [],
    recipeDrops: [],
  };
}

const nightWatch1 = nightQuest(
  'nightWatch1',
  'Night Watch',
  '🏮',
  ratCellar,
  ['giantRat', 'cellarSpider'],
  { name: 'loose slates', targets: 'one' },
  'nightProwler',
);
const nightWatch2 = nightQuest(
  'nightWatch2',
  'Road Watch',
  '🌉',
  wolfDen,
  ['wolfPup', 'greyWolf'],
  { name: 'washed-out ford', targets: 'one' },
  'roadStalker',
);
const nightWatch3 = nightQuest(
  'nightWatch3',
  'Deep Watch',
  '⛏️',
  hauntedMine,
  ['ghostBat', 'skeletonMiner'],
  { name: 'creaking beam', targets: 'one' },
  'shaftHaunt',
);
const nightWatch4 = nightQuest(
  'nightWatch4',
  'Border Watch',
  '🗼',
  harpyCliffs,
  ['rockLizard', 'cliffEagle'],
  { name: 'loose scree', targets: 'one' },
  'campRaider',
);
const nightWatch5 = nightQuest(
  'nightWatch5',
  'Rampart Watch',
  '🏰',
  wyvernPeaks,
  ['frostWolf', 'mountainTroll'],
  { name: 'toppled masonry', targets: 'one' },
  'ashStalker',
);

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
      { name: 'sticky web', targets: 'one' },
      [{ type: 'trap', weight: 4, name: 'web snare', targets: 'all' }],
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
      { name: 'open grave', targets: 'one' },
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
      { name: 'loose millstone', targets: 'one' },
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
      { name: 'tripwire bell', targets: 'one' },
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
      { name: 'tripwire volley', targets: 'all' },
      [obstacle('barricade', 'palisade gate', 1)],
    ),
    boss: bossById.banditCaptain,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [20, 40],
    xp: 100,
    loot: [],
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
      { name: 'sinking barrow', targets: 'one' },
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
      { name: 'bramble snare', targets: 'one', element: 'grass' },
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
      { name: 'sudden current', targets: 'all', element: 'water' },
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
      { name: 'murder hole', targets: 'one' },
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
      { name: 'falling boulders', targets: 'all' },
      [obstacle('rubble', 'quarry rockfall', 3)],
    ),
    boss: bossById.ogreChieftain,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [40, 80],
    xp: 220,
    loot: [],
    recipeDrops: [
      { recipeId: 'stonePickaxe', chance: 1 },
      { recipeId: 'emberWardSalve', chance: 0.2 },
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
      { name: 'spore burst', targets: 'all', element: 'grass' },
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
      { name: 'lightning rod', targets: 'one', element: 'electric' },
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
      { name: 'rune ward', targets: 'all' },
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
      { name: 'sucking bog', targets: 'one' },
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
      { name: 'poison dart trap', targets: 'one' },
      [obstacle('locked', 'sealed crypt door', 1)],
    ),
    boss: bossById.lichOfTheDeep,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [80, 160],
    xp: 400,
    loot: [],
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
      { name: 'charged stones', targets: 'all', element: 'electric' },
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
      { name: 'grasping bones', targets: 'one' },
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
      { name: 'swinging blade', targets: 'one' },
      [
        { type: 'trap', weight: 4, name: 'gear crusher', targets: 'all' },
        { type: 'trap', weight: 3, name: 'dart wall', targets: 'one' },
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
      { name: 'thin ice', targets: 'one', element: 'water' },
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
      { name: 'rolling boulder', targets: 'all' },
      [obstacle('locked', 'giant-sized door', 1), obstacle('rubble', 'toppled pillar', 4)],
    ),
    boss: bossById.giantKing,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [160, 320],
    xp: 600,
    loot: [],
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
      { name: 'collapsing reliquary', targets: 'all' },
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
      { name: 'lightning strike', targets: 'one', element: 'electric' },
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
      { name: 'crushing pressure', targets: 'all', element: 'water' },
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
      { name: 'toppling statue', targets: 'all' },
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
      { name: 'dragonfire vent', targets: 'all', element: 'fire' },
      [obstacle('locked', 'hoard vault door', 1)],
    ),
    boss: bossById.elderDragon,
    mainRewardChance: 1,
    mainRewardExtraRollChance: 0.5,
    gold: [320, 640],
    xp: 900,
    loot: [],
    recipeDrops: [
      { recipeId: 'steelPickaxe', chance: 1 },
      { recipeId: 'steelArmour', chance: 0.3 },
    ],
  },

  // Overnight quests: open every day, unlocked with their tier.
  nightWatch1,
  nightWatch2,
  nightWatch3,
  nightWatch4,
  nightWatch5,
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
