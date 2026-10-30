import type { DungeonDef, EncounterDef, ObstacleKind } from '@/game/types';

import { bossById } from './enemies';
import { lootConfig } from './loot/config';

// Five tiers, one per gear tier (wood → steel). Each tier has a fixed boss
// dungeon, which drops the pickaxe that opens the next tier's material, and a
// pool of regular dungeons: three `short` (farm) and three `long` ones. Each day
// one of each is open (see game/dungeons/rotation.ts). A tier shows up once the
// previous tier's boss has been beaten.
// A run is a series of encounters drawn from the dungeon's pool, then its boss.
// Regular dungeons of a slot share their tier's gold and XP. Gold per run
// follows the tier curve (lootConfig.goldByTier, the enemy strength curve):
// players collect once a session, so runs, not hours, set
// daily income. Everything else a win pays is rolled from the loot matrix
// (content/loot/matrix.ts).
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

/** Tier 1's gold per slot; every tier's gold comes from these times its curve multiplier. */
const tier1Gold = { short: [5, 12], long: [8, 18], boss: [20, 40] } as { short: [number, number]; long: [number, number]; boss: [number, number] };

/** A slot's gold at a tier: tier 1's amounts times the tier's multiplier (lootConfig.goldByTier), rounded. */
const slotGold = (tier: number, slot: keyof typeof tier1Gold): [number, number] => [
  Math.round(tier1Gold[slot][0] * lootConfig.goldByTier[tier - 1]),
  Math.round(tier1Gold[slot][1] * lootConfig.goldByTier[tier - 1]),
];

/** A new pool dungeon with the rewards of an existing one of the same tier and slot. */
const sameRewards = (base: DungeonDef) => ({
  tier: base.tier,
  slot: base.slot,
  durationMinutes: base.durationMinutes,
  encounterCount: base.encounterCount,
  gold: base.gold,
  xp: base.xp,
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
  gold: slotGold(1, 'short'),
  xp: 30,
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
  gold: slotGold(1, 'long'),
  xp: 50,
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
  gold: slotGold(2, 'short'),
  xp: 80,
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
  gold: slotGold(2, 'long'),
  xp: 120,
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
  gold: slotGold(3, 'short'),
  xp: 150,
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
  gold: slotGold(3, 'long'),
  xp: 220,
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
  gold: slotGold(4, 'short'),
  xp: 250,
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
  gold: slotGold(4, 'long'),
  xp: 350,
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
  gold: slotGold(5, 'short'),
  xp: 400,
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
  gold: slotGold(5, 'long'),
  xp: 550,
};

/**
 * Overnight expeditions: one per tier, open every day alongside the rotation and
 * unlocked with its tier. A long, safe patrol for players who won't be back
 * for hours: it pays about `goldRunsWorth`/`xpRunsWorth` short runs of the tier, counted as
 * `supplyHours` of supply per hero, and is the only dungeon with `overnight`.
 */
export const overnightExpeditionRules = {
  /** Hours a patrol takes. */
  durationHours: 8,
  /** Gold for about this many of the tier's short runs. */
  goldRunsWorth: 3,
  /** XP for about this many of the tier's short runs. */
  xpRunsWorth: 3,
  /** Supply points per hero: a patrol is counted as this many started hours. */
  supplyHours: 3,
};

/** The tier's overnight expedition: the short dungeon's easiest mobs, a mild trap and a patrol leader. */
function nightExpedition(
  id: string,
  name: string,
  emoji: string,
  base: DungeonDef,
  [weak, normal]: string[],
  trap: Omit<Trap, 'type' | 'weight'>,
  bossId: string,
): DungeonDef {
  const { goldRunsWorth, xpRunsWorth } = overnightExpeditionRules;
  return {
    id,
    name,
    emoji,
    tier: base.tier,
    overnight: true,
    durationMinutes: overnightExpeditionRules.durationHours * 60,
    encounterCount: [4, 5],
    encounters: [
      { type: 'fight', weight: 3, mobs: [{ mobId: weak, count: 2 }] },
      { type: 'fight', weight: 3, mobs: [{ mobId: normal, count: 1 }] },
      { type: 'trap', weight: 2, ...trap },
      { type: 'event', weight: 1, eventId: 'spring' },
      { type: 'event', weight: 1, eventId: 'cache' },
    ],
    boss: bossById[bossId],
    gold: [base.gold[0] * goldRunsWorth, base.gold[1] * goldRunsWorth],
    xp: base.xp * xpRunsWorth,
  };
}

const nightWatch1 = nightExpedition(
  'nightWatch1',
  'Night Watch',
  '🏮',
  ratCellar,
  ['giantRat', 'cellarSpider'],
  { name: 'loose slates', targets: 'one' },
  'nightProwler',
);
const nightWatch2 = nightExpedition(
  'nightWatch2',
  'Road Watch',
  '🌉',
  wolfDen,
  ['wolfPup', 'greyWolf'],
  { name: 'washed-out ford', targets: 'one' },
  'roadStalker',
);
const nightWatch3 = nightExpedition(
  'nightWatch3',
  'Deep Watch',
  '⛏️',
  hauntedMine,
  ['ghostBat', 'skeletonMiner'],
  { name: 'creaking beam', targets: 'one' },
  'shaftHaunt',
);
const nightWatch4 = nightExpedition(
  'nightWatch4',
  'Border Watch',
  '🗼',
  harpyCliffs,
  ['rockLizard', 'cliffEagle'],
  { name: 'loose scree', targets: 'one' },
  'campRaider',
);
const nightWatch5 = nightExpedition(
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
    gold: slotGold(1, 'boss'),
    xp: 100,
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
    gold: slotGold(2, 'boss'),
    xp: 220,
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
    gold: slotGold(3, 'boss'),
    xp: 400,
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
    gold: slotGold(4, 'boss'),
    xp: 600,
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
    gold: slotGold(5, 'boss'),
    xp: 900,
  },

  // Overnight expeditions: open every day, unlocked with their tier.
  nightWatch1,
  nightWatch2,
  nightWatch3,
  nightWatch4,
  nightWatch5,
];

/**
 * Secret underwater dungeons (see content/secrets.ts), one per tier: a water
 * dungeon's enemies and trap with an elite water foe instead of its boss, and
 * the rewards and length of the tier's long dungeon. Launched from a tipped
 * place, never in the rotation.
 */
const underwaterBases = [
  { base: 'smugglersCove', name: 'Flooded Cove', bossId: 'drownedEnforcer' },
  { base: 'sunkenFord', name: 'Drowned Barracks', bossId: 'drownedSergeant' },
  { base: 'drownedCrypt', name: 'Sunken Crypt', bossId: 'barnacledKnight' },
  { base: 'frozenLake', name: 'Frozen Deep', bossId: 'elderSerpent' },
  { base: 'abyssalDepths', name: 'Abyssal Trench', bossId: 'krakenBrood' },
];

export const underwaterDungeons: DungeonDef[] = underwaterBases.map(({ base, name, bossId }) => {
  const from = dungeons.find((d) => d.id === base)!;
  const long = dungeons.find((d) => d.tier === from.tier && d.slot === 'long')!;
  return {
    id: underwaterDungeonId(from.tier),
    name,
    emoji: '🫧',
    secret: true,
    tier: from.tier,
    durationMinutes: long.durationMinutes,
    encounterCount: long.encounterCount,
    encounters: from.encounters,
    boss: bossById[bossId],
    gold: long.gold,
    xp: long.xp,
  };
});

/** The underwater dungeon of a tier, and the water dungeon its threats come from. */
export function underwaterDungeonId(tier: number) {
  return `underwater${tier}`;
}

export const underwaterThreatBase: Record<string, string> = Object.fromEntries(
  underwaterBases.map(({ base }, i) => [underwaterDungeonId(i + 1), base]),
);

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
  critMultiplier: 1.5,
  /** Enemies' flat crit chance; heroes use their Crit stat instead. */
  enemyCritChance: 0.1,
  /** Enemy hits are avoided with chance min(Evasion, cap) %. */
  evasionCap: 40,
  /** An armoured threat's penalty on Magic hits: that share of the Power penalty. */
  magicArmourShare: 0.5,
  /** A hero faster than their target may strike twice: this chance per Speed point of the gap, capped. */
  speed: { secondAttackPerPoint: 0.1, max: 0.5 },
  /** Party Luck (sum of the heroes'): rewards per point of it. */
  luck: { goldPerPoint: 0.05, rollPerPoint: 0.1 },
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
