import { difficultyRules, type Difficulty } from './difficulty';
import type { DungeonDef, EncounterDef, ObstacleKind } from '@/game/types';

import { bossById } from './enemies';
import { lootConfig } from './loot/config';

// Five tiers, one per gear tier (wood → steel). Each tier has a chain of six
// regular dungeons ordered by difficulty (easy, easy, medium, medium, hard,
// hard) closed by its boss, which drops the pickaxe that opens the next tier's
// material. Each chain dungeon opens once the one before it is cleared; every
// unlocked one is open every day, and what changes daily is its briefing (see
// game/dungeons/rotation.ts).
// A run is a series of encounters drawn from the dungeon's pool, then its boss.
// Chain rewards grow with the difficulty (difficultyRules.rewards); gold per
// run follows the tier curve (lootConfig.goldByTier, the enemy strength
// curve): players collect once a session, so runs, not hours, set daily
// income. Everything else a win pays is rolled from the loot matrix
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

/** The tier's short and long run lengths, in minutes; a chain dungeon's comes from its difficulty. */
const durationByTier: Record<number, [short: number, long: number]> = {
  1: [5, 15],
  2: [10, 30],
  3: [20, 45],
  4: [30, 60],
  5: [45, 90],
};

/** The tier's short-slot XP; a chain dungeon's comes from this times its difficulty's multiplier. */
const shortXpByTier = [30, 80, 150, 250, 400];

/** A chain difficulty's length at a tier: the tier's short run, its long one, or the rounded midpoint. */
function chainDuration(tier: number, difficulty: Difficulty): number {
  const [short, long] = durationByTier[tier];
  return difficulty === 'easy' ? short : difficulty === 'hard' ? long : Math.round((short + long) / 2);
}

/** A chain difficulty's encounter count: hard runs one encounter longer. */
const chainEncounters = (difficulty: Difficulty): [number, number] => (difficulty === 'hard' ? [5, 6] : [4, 5]);

/** A chain difficulty's gold at a tier: tier 1's short range [5, 12] times the tier's curve and the difficulty's multiplier. */
function chainGold(tier: number, difficulty: Difficulty): [number, number] {
  const curve = lootConfig.goldByTier[tier - 1];
  const goldXp = difficultyRules.rewards[difficulty].goldXp;
  return [Math.round(5 * curve * goldXp), Math.round(12 * curve * goldXp)];
}

/** A chain difficulty's XP at a tier: the tier's short-slot XP times the difficulty's multiplier. */
const chainXp = (tier: number, difficulty: Difficulty) =>
  Math.round(shortXpByTier[tier - 1] * difficultyRules.rewards[difficulty].goldXp);

/** A tier boss's gold: tier 1's boss range [20, 40] times the tier's curve. */
const bossGold = (tier: number): [number, number] => [
  Math.round(20 * lootConfig.goldByTier[tier - 1]),
  Math.round(40 * lootConfig.goldByTier[tier - 1]),
];

/** A chain dungeon's fields, from its tier and difficulty. */
const chain = (tier: number, difficulty: Difficulty) => ({
  tier,
  difficulty,
  durationMinutes: chainDuration(tier, difficulty),
  encounterCount: chainEncounters(difficulty),
  gold: chainGold(tier, difficulty),
  xp: chainXp(tier, difficulty),
});

// Tier 1: wood
const ratCellar: DungeonDef = {
  id: 'ratCellar',
  name: 'Rat Cellar',
  emoji: '🐀',
  chainIndex: 0,
  ...chain(1, 'easy'),
  encounters: encounterPool(['giantRat', 'cellarSpider', 'ratSwarm'], {
    name: 'rusty snare',
  }),
  boss: bossById.ratKing,
};
const goblinWarren: DungeonDef = {
  id: 'goblinWarren',
  name: 'Goblin Warren',
  emoji: '👺',
  chainIndex: 3,
  ...chain(1, 'medium'),
  encounters: encounterPool(
    ['goblinRunt', 'goblin', 'goblinSlinger'],
    { name: 'spike pit' },
    [obstacle('barricade', 'junk barricade', 3), obstacle('rubble', 'caved-in tunnel')],
  ),
  boss: bossById.goblinChief,
};
// Tier 2: stone
const wolfDen: DungeonDef = {
  id: 'wolfDen',
  name: 'Wolf Den',
  emoji: '🐺',
  chainIndex: 2,
  ...chain(2, 'medium'),
  encounters: encounterPool(['wolfPup', 'greyWolf', 'direWolf'], {
    name: 'rockslide',
  }),
  boss: bossById.alphaWolf,
};
const trollBridge: DungeonDef = {
  id: 'trollBridge',
  name: 'Troll Bridge',
  emoji: '🌉',
  chainIndex: 3,
  ...chain(2, 'medium'),
  encounters: encounterPool(
    ['bogHound', 'highwayBandit', 'riverTroll'],
    { name: 'rotten plank' },
    [locals('tollTroll', 2), locals('hermit', 3), locals('pedlar', 2), obstacle('rubble', 'collapsed arch', 1)],
  ),
  boss: bossById.bridgeTroll,
};
// Tier 3: copper
const hauntedMine: DungeonDef = {
  id: 'hauntedMine',
  name: 'Haunted Mine',
  emoji: '👻',
  chainIndex: 5,
  ...chain(3, 'hard'),
  encounters: encounterPool(
    ['ghostBat', 'skeletonMiner', 'mineGhost'],
    { name: 'collapsing tunnel' },
    [locals('lostMiner')],
  ),
  boss: bossById.mineWraith,
};
const cinderHollow: DungeonDef = {
  id: 'cinderHollow',
  name: 'Cinder Hollow',
  emoji: '🌋',
  chainIndex: 4,
  ...chain(3, 'hard'),
  encounters: encounterPool(['fireImp', 'magmaSlug', 'emberHound'], {
    name: 'lava vent',
    element: 'fire',
  }),
  boss: bossById.ashWyrm,
};
// Tier 4: iron
const harpyCliffs: DungeonDef = {
  id: 'harpyCliffs',
  name: 'Harpy Cliffs',
  emoji: '🦅',
  chainIndex: 2,
  ...chain(4, 'medium'),
  encounters: encounterPool(
    ['rockLizard', 'cliffEagle', 'harpy'],
    { name: 'crumbling ledge' },
    [obstacle('rubble', 'fallen boulders', 1)],
  ),
  boss: bossById.harpyMatriarch,
};
const orcWarcamp: DungeonDef = {
  id: 'orcWarcamp',
  name: 'Orc Warcamp',
  emoji: '🪓',
  chainIndex: 4,
  ...chain(4, 'hard'),
  encounters: encounterPool(
    ['orcGrunt', 'orcRaider', 'orcShaman'],
    { name: 'bear trap' },
    [obstacle('barricade', 'spiked barricade', 3), obstacle('locked', 'chained gate', 1)],
  ),
  boss: bossById.orcWarlord,
};
// Tier 5: steel
const wyvernPeaks: DungeonDef = {
  id: 'wyvernPeaks',
  name: 'Wyvern Peaks',
  emoji: '🏔️',
  chainIndex: 4,
  ...chain(5, 'hard'),
  encounters: encounterPool(
    ['frostWolf', 'mountainTroll', 'wyvern'],
    { name: 'avalanche' },
    [obstacle('rubble', 'snowed-in pass', 1)],
  ),
  boss: bossById.wyvernQueen,
};
const ashenCitadel: DungeonDef = {
  id: 'ashenCitadel',
  name: 'Ashen Citadel',
  emoji: '🔥',
  chainIndex: 2,
  ...chain(5, 'medium'),
  encounters: encounterPool(
    ['flameCultist', 'cinderGolem', 'ashKnight'],
    { name: 'flame jet', element: 'fire' },
    [obstacle('barricade', 'smouldering barricade', 1), obstacle('locked', 'sealed citadel door', 1)],
  ),
  boss: bossById.ashLord,
};

/**
 * Overnight expeditions: one per tier, open every day and unlocked with its
 * tier. A long, safe patrol for players who won't be back for hours: it pays
 * about `goldRunsWorth`/`xpRunsWorth` easy runs of the tier, counted as
 * `supplyHours` of supply per hero, and is the only dungeon with `overnight`.
 */
export const overnightExpeditionRules = {
  /** Hours a patrol takes. */
  durationHours: 8,
  /** Gold for about this many of the tier's easy runs. */
  goldRunsWorth: 3,
  /** XP for about this many of the tier's easy runs. */
  xpRunsWorth: 3,
  /** Supply points per hero: a patrol is counted as this many started hours. */
  supplyHours: 3,
};

/** The tier's overnight expedition: mild mobs, a mild trap and a patrol leader, paid like easy runs. */
function nightExpedition(
  id: string,
  name: string,
  emoji: string,
  tier: number,
  [weak, normal]: string[],
  trap: Omit<Trap, 'type' | 'weight'>,
  bossId: string,
): DungeonDef {
  const { goldRunsWorth, xpRunsWorth } = overnightExpeditionRules;
  const gold = chainGold(tier, 'easy');
  return {
    id,
    name,
    emoji,
    tier,
    difficulty: 'easy',
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
    gold: [gold[0] * goldRunsWorth, gold[1] * goldRunsWorth],
    xp: chainXp(tier, 'easy') * xpRunsWorth,
  };
}

export const dungeons: DungeonDef[] = [
  // Tier 1: wood
  ratCellar,
  {
    id: 'spiderBurrow',
    name: 'Spider Burrow',
    emoji: '🕷️',
    chainIndex: 1,
    ...chain(1, 'easy'),
    encounters: encounterPool(
      ['webling', 'burrowSpider', 'broodGuard'],
      { name: 'sticky web' },
      [{ type: 'trap', weight: 4, name: 'web snare' }],
    ),
    boss: bossById.broodMother,
  },
  {
    id: 'oldGraveyard',
    name: 'Old Graveyard',
    emoji: '🪦',
    chainIndex: 2,
    ...chain(1, 'medium'),
    encounters: encounterPool(
      ['restlessBones', 'ghoul', 'ghoul'],
      { name: 'open grave' },
      [locals('hermit')],
    ),
    boss: bossById.graveLord,
  },
  goblinWarren,
  {
    id: 'smugglersCove',
    name: 'Smugglers’ Cove',
    emoji: '🏴‍☠️',
    chainIndex: 4,
    ...chain(1, 'hard'),
    encounters: encounterPool(
      ['cutpurse', 'smuggler', 'coveEnforcer'],
      { name: 'tripwire bell' },
      [locals('pedlar', 4), locals('poachers', 3), obstacle('locked', 'smugglers’ hatch', 1)],
    ),
    boss: bossById.smugglerQueen,
  },
  {
    id: 'millRuins',
    name: 'Collapsed Mill',
    emoji: '🏚️',
    chainIndex: 5,
    ...chain(1, 'hard'),
    encounters: encounterPool(
      ['millRat', 'squatter', 'millBrute'],
      { name: 'loose millstone' },
      [obstacle('rubble', 'fallen beams', 3), obstacle('rubble', 'grain-choked stairs', 2), locals('pedlar')],
    ),
    boss: bossById.millOgre,
  },
  {
    id: 'banditStockade',
    name: 'Bandit Stockade',
    emoji: '🏚️',
    tier: 1,
    difficulty: 'boss',
    chainIndex: 6,
    isBoss: true,
    durationMinutes: 30,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['guardDog', 'bandit', 'banditArcher'],
      { name: 'tripwire volley' },
      [obstacle('barricade', 'palisade gate', 1)],
    ),
    boss: bossById.banditCaptain,
    gold: bossGold(1),
    xp: 100,
  },

  // Tier 2: stone
  {
    id: 'sunkenFord',
    name: 'Sunken Ford',
    emoji: '🌊',
    chainIndex: 0,
    ...chain(2, 'easy'),
    encounters: encounterPool(
      ['fordLeech', 'riverSprite', 'drownedSoldier'],
      { name: 'sudden current', element: 'water' },
      [obstacle('rubble', 'silted crossing', 2)],
    ),
    boss: bossById.fordHag,
  },
  {
    id: 'boarThicket',
    name: 'Boar Thicket',
    emoji: '🐗',
    chainIndex: 1,
    ...chain(2, 'easy'),
    encounters: encounterPool(
      ['thornPiglet', 'wildBoar', 'briarTusker'],
      { name: 'bramble snare', element: 'grass' },
      [locals('poachers')],
    ),
    boss: bossById.thicketBoar,
  },
  wolfDen,
  trollBridge,
  {
    id: 'watchtower',
    name: 'Abandoned Watchtower',
    emoji: '🗼',
    chainIndex: 4,
    ...chain(2, 'hard'),
    encounters: encounterPool(
      ['towerCrow', 'deserter', 'towerSergeant'],
      { name: 'murder hole' },
      [obstacle('barricade', 'barred stairwell', 3), obstacle('locked', 'armoury door', 2)],
    ),
    boss: bossById.turncoatKnight,
  },
  {
    id: 'barrowMounds',
    name: 'Barrow Mounds',
    emoji: '⚱️',
    chainIndex: 5,
    ...chain(2, 'hard'),
    encounters: encounterPool(
      ['barrowWight', 'barrowRat', 'mouldKnight'],
      { name: 'sinking barrow' },
      [{ type: 'fight', weight: 3, mobs: [{ mobId: 'barrowWight', count: 2 }, { mobId: 'mouldKnight', count: 1 }] }],
    ),
    boss: bossById.barrowKing,
  },
  {
    id: 'ogreQuarry',
    name: 'Ogre Quarry',
    emoji: '👹',
    tier: 2,
    difficulty: 'boss',
    chainIndex: 6,
    isBoss: true,
    durationMinutes: 60,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['ogreBrute', 'rockGolem', 'quarryOgre'],
      { name: 'falling boulders' },
      [obstacle('rubble', 'quarry rockfall', 3)],
    ),
    boss: bossById.ogreChieftain,
    gold: bossGold(2),
    xp: 220,
  },

  // Tier 3: copper
  {
    id: 'dwarfhold',
    name: 'Collapsed Dwarfhold',
    emoji: '⛏️',
    chainIndex: 0,
    ...chain(3, 'easy'),
    encounters: encounterPool(
      ['tunnelBeetle', 'stoneWarden', 'runeGolem'],
      { name: 'rune ward' },
      [obstacle('rubble', 'collapsed gallery', 3), obstacle('locked', 'dwarven vault door', 2), locals('lostMiner')],
    ),
    boss: bossById.forgeGuardian,
  },
  {
    id: 'stormRidge',
    name: 'Storm Ridge',
    emoji: '⚡',
    chainIndex: 1,
    ...chain(3, 'easy'),
    encounters: encounterPool(
      ['sparkMoth', 'stormHawk', 'boltElemental'],
      { name: 'lightning rod', element: 'electric' },
      [{ type: 'fight', weight: 2, mobs: [{ mobId: 'boltElemental', count: 2 }] }],
    ),
    boss: bossById.stormRoc,
  },
  {
    id: 'witchMarsh',
    name: 'Marsh Witch Hut',
    emoji: '🧙',
    chainIndex: 2,
    ...chain(3, 'medium'),
    encounters: encounterPool(
      ['marshToad', 'bogling', 'hexedHunter'],
      { name: 'sucking bog' },
      [locals('hermit', 3), locals('poachers', 2)],
    ),
    boss: bossById.marshWitch,
  },
  {
    id: 'fungalGrotto',
    name: 'Fungal Grotto',
    emoji: '🍄',
    chainIndex: 3,
    ...chain(3, 'medium'),
    encounters: encounterPool(
      ['sporeling', 'capCrawler', 'mycelTroll'],
      { name: 'spore burst', element: 'grass' },
    ),
    boss: bossById.sporeQueen,
  },
  cinderHollow,
  hauntedMine,
  {
    id: 'drownedCrypt',
    name: 'Drowned Crypt',
    emoji: '⚰️',
    tier: 3,
    difficulty: 'boss',
    chainIndex: 6,
    isBoss: true,
    durationMinutes: 90,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['cryptEel', 'drownedDead', 'boneKnight'],
      { name: 'poison dart trap' },
      [obstacle('locked', 'sealed crypt door', 1)],
    ),
    boss: bossById.lichOfTheDeep,
    gold: bossGold(3),
    xp: 400,
  },

  // Tier 4: iron
  {
    id: 'clockworkVault',
    name: 'Clockwork Vault',
    emoji: '⚙️',
    chainIndex: 0,
    ...chain(4, 'easy'),
    encounters: encounterPool(
      ['brassBeetle', 'clockworkGuard', 'vaultAutomaton'],
      { name: 'swinging blade' },
      [
        { type: 'trap', weight: 4, name: 'gear crusher' },
        { type: 'trap', weight: 3, name: 'dart wall' },
        obstacle('locked', 'tumbler door', 2),
      ],
    ),
    boss: bossById.clockworkWarden,
  },
  {
    id: 'thunderPlateau',
    name: 'Thunder Plateau',
    emoji: '🌩️',
    chainIndex: 1,
    ...chain(4, 'easy'),
    encounters: encounterPool(
      ['stormRam', 'thunderbird', 'skyfallGolem'],
      { name: 'charged stones', element: 'electric' },
    ),
    boss: bossById.thunderTitan,
  },
  harpyCliffs,
  {
    id: 'frozenLake',
    name: 'Frozen Lake',
    emoji: '🧊',
    chainIndex: 3,
    ...chain(4, 'medium'),
    encounters: encounterPool(
      ['iceSeal', 'frostNymph', 'lakeSerpent'],
      { name: 'thin ice', element: 'water' },
      [{ type: 'fight', weight: 2, mobs: [{ mobId: 'frostNymph', count: 3 }] }],
    ),
    boss: bossById.iceWyrm,
  },
  orcWarcamp,
  {
    id: 'boneField',
    name: 'Bone Field',
    emoji: '💀',
    chainIndex: 5,
    ...chain(4, 'hard'),
    encounters: encounterPool(
      ['boneCrawler', 'fallenLegionary', 'deathCaptain'],
      { name: 'grasping bones' },
      [locals('hermit')],
    ),
    boss: bossById.boneGeneral,
  },
  {
    id: 'giantsHall',
    name: "Giant's Hall",
    emoji: '🏰',
    tier: 4,
    difficulty: 'boss',
    chainIndex: 6,
    isBoss: true,
    durationMinutes: 120,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['giantHound', 'stoneSentinel', 'hillGiant'],
      { name: 'rolling boulder' },
      [obstacle('locked', 'giant-sized door', 1), obstacle('rubble', 'toppled pillar', 4)],
    ),
    boss: bossById.giantKing,
    gold: bossGold(4),
    xp: 600,
  },

  // Tier 5: steel
  {
    id: 'stormIsle',
    name: 'Stormcaller Isle',
    emoji: '🌀',
    chainIndex: 0,
    ...chain(5, 'easy'),
    encounters: encounterPool(
      ['stormEel', 'tempestCaller', 'thunderDrake'],
      { name: 'lightning strike', element: 'electric' },
    ),
    boss: bossById.stormcaller,
  },
  {
    id: 'abyssalDepths',
    name: 'Abyssal Depths',
    emoji: '🐙',
    chainIndex: 1,
    ...chain(5, 'easy'),
    encounters: encounterPool(
      ['deepAngler', 'abyssalPriest', 'krakenSpawn'],
      { name: 'crushing pressure', element: 'water' },
      [{ type: 'fight', weight: 2, mobs: [{ mobId: 'abyssalPriest', count: 2 }] }],
    ),
    boss: bossById.abyssalHorror,
  },
  ashenCitadel,
  {
    id: 'titanRuins',
    name: 'Titan Ruins',
    emoji: '🗿',
    chainIndex: 3,
    ...chain(5, 'medium'),
    encounters: encounterPool(
      ['ruinCrawler', 'titanShard', 'colossusArm'],
      { name: 'toppling statue' },
      [obstacle('rubble', 'titan’s fallen hand', 3), obstacle('rubble', 'buried causeway', 2), locals('lostMiner')],
    ),
    boss: bossById.titanHeart,
  },
  wyvernPeaks,
  {
    id: 'ossuary',
    name: 'Ossuary of Kings',
    emoji: '👑',
    chainIndex: 5,
    ...chain(5, 'hard'),
    encounters: encounterPool(
      ['cryptGuard', 'boneLord', 'deathKnight'],
      { name: 'collapsing reliquary' },
      [obstacle('locked', 'royal tomb seal', 1)],
    ),
    boss: bossById.ossuaryKing,
  },
  {
    id: 'dragonLair',
    name: "Dragon's Lair",
    emoji: '🐉',
    tier: 5,
    difficulty: 'boss',
    chainIndex: 6,
    isBoss: true,
    durationMinutes: 180,
    encounterCount: [6, 8],
    encounters: encounterPool(
      ['dragonCultist', 'drake', 'fireElemental'],
      { name: 'dragonfire vent', element: 'fire' },
      [obstacle('locked', 'hoard vault door', 1)],
    ),
    boss: bossById.elderDragon,
    gold: bossGold(5),
    xp: 900,
  },

  // Overnight expeditions: open every day, unlocked with their tier.
  nightExpedition(
    'nightWatch1',
    'Night Watch',
    '🏮',
    1,
    ['giantRat', 'cellarSpider'],
    { name: 'loose slates' },
    'nightProwler',
  ),
  nightExpedition(
    'nightWatch2',
    'Road Watch',
    '🌉',
    2,
    ['wolfPup', 'greyWolf'],
    { name: 'washed-out ford' },
    'roadStalker',
  ),
  nightExpedition(
    'nightWatch3',
    'Deep Watch',
    '⛏️',
    3,
    ['ghostBat', 'skeletonMiner'],
    { name: 'creaking beam' },
    'shaftHaunt',
  ),
  nightExpedition(
    'nightWatch4',
    'Border Watch',
    '🗼',
    4,
    ['rockLizard', 'cliffEagle'],
    { name: 'loose scree' },
    'campRaider',
  ),
  nightExpedition(
    'nightWatch5',
    'Rampart Watch',
    '🏰',
    5,
    ['frostWolf', 'mountainTroll'],
    { name: 'toppled masonry' },
    'ashStalker',
  ),
];

/**
 * Secret underwater dungeons (see content/secrets.ts), one per tier: a water
 * dungeon's enemies and trap with an elite water foe instead of its boss, and
 * the rewards and length of the tier's first hard dungeon. Launched from a
 * tipped place, never in the rotation.
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
  const hard = dungeons.find((d) => d.tier === from.tier && d.chainIndex === 4)!;
  return {
    id: underwaterDungeonId(from.tier),
    name,
    emoji: '🫧',
    secret: true,
    tier: from.tier,
    difficulty: 'hard',
    durationMinutes: hard.durationMinutes,
    encounterCount: hard.encounterCount,
    encounters: from.encounters,
    boss: bossById[bossId],
    gold: hard.gold,
    xp: hard.xp,
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
  /**
   * The run's tally as a report keeps it (see expeditions/tally.ts): the largest
   * contributions only, ranked in HP, an enemy turn denied, a fight skipped and a
   * knockout saved each worth this share of the party's mean max HP.
   */
  tally: { contributionsKept: 10, worth: { turn: 0.1, fight: 0.5, save: 0.5 } },
  /** The report card (see expeditions/reportCard.ts). */
  card: {
    /** "Your work" shows at most this many lines… */
    workLines: 3,
    /** …each for a contribution worth at least this share of the party's mean max HP (ranked as the tally ranks them). */
    workThreshold: 0.25,
    /** A damage line names its share of the party's damage from this share on, its amount below it. */
    damageShareFrom: 0.1,
    /** Hero of the run: the largest share of the party's damage, healing and (standing heroes only) this part of the hits taken, in HP; the boss's killing blow adds `bossKill` to the share. */
    heroOfRun: { bossKill: 0.25, taken: 0.5 },
  },
};
