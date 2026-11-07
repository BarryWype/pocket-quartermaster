import type { PatrolKind } from '@/game/patrols/generate';
import type { FightPlaceKind } from '@/content/placeFights';
import { ELEMENTS, type Element } from '@/game/elements';
import type { BossDef, DamageStat, MobDef, SanctumDef, SpeedClass, Tag } from '@/game/types';

import { dungeonFactors, patrolFactors, placeFactors } from './difficultyFactors';
import { sanctumRules, sanctums } from './sanctums';

/** An enemy's Speed from its class and tier: the class base, plus one per tier above the first. */
export const enemySpeedRules: Record<SpeedClass, number> & { speedPerTier: number } = {
  slow: 3,
  normal: 5,
  fast: 7,
  speedPerTier: 1,
};

// Enemies are written at tier 1 strength, then scaled by their tier and by how
// tough their dungeon should be within it. Per-dungeon factors are fitted to a
// reference team (the starting trio in the tier's sword, bow and wand plus
// mail, Common gear at the average roll, at the top of the tier's level band, no threats):
// short dungeons about 72%, long about 68%, bosses about 38% before a further
// ×1.3. Real rosters do much better (trinkets, rarer gear and affixes, meals, the
// boss's weakness item). Tier 1 short dungeons are kept softer for onboarding
// (Rat Cellar is the tutorial dungeon).
export const TIER_SCALE = [1, 1.9, 3, 4.2, 5.6];

/** A dungeon's scaling, with its tier for enemy Speed. */
type Strength = { tier: number; scale: number };

const strength = (tier: number, dungeonFactor: number): Strength => ({ tier, scale: TIER_SCALE[tier - 1] * dungeonFactor });

/** A chain dungeon's fitted factor (see content/difficultyFactors.ts), or its hand-tuned one. */
const D = (id: string, fallback: number) => dungeonFactors[id] ?? fallback;

/**
 * Natural armour of the armoured kinds (constructs and golems, shelled beasts,
 * armoured knights and soldiers, the scaled elder dragon): the share of a Power hit it blocks, by tier;
 * Magic hits meet part of it (expeditionRules.magicArmourShare), Pierce none.
 * Rough numbers: enemy strength is refitted around them.
 */
export const enemyArmourRules = {
  byTier: [0.15, 0.18, 0.21, 0.24, 0.27],
  tags: ['construct', 'carapace'] as Tag[],
  /** Armoured by name wherever they appear: dungeons, patrols, places. */
  names: [
    'mould knight',
    'bone knight',
    'death knight',
    'ash knight',
    'turncoat knight',
    'barnacled knight',
    'fallen legionary',
    'death captain',
    'bone general',
    'tower sergeant',
    'crypt guard',
    'bandit captain',
    'orc warlord',
    'elder dragon',
  ],
};

const enemyArmour = (name: string, tags: Tag[], tier: number) =>
  tags.some((tag) => enemyArmourRules.tags.includes(tag)) || enemyArmourRules.names.includes(name) ? enemyArmourRules.byTier[tier - 1] : undefined;

const enemySpeed = (tier: number, speedClass: SpeedClass) =>
  enemySpeedRules[speedClass] + enemySpeedRules.speedPerTier * (tier - 1);

function mob(
  id: string,
  name: string,
  s: Strength,
  hp: number,
  damage: number,
  tags: Tag[] = [],
  element?: Element,
  speedClass: SpeedClass = 'normal',
  damageType?: DamageStat,
): MobDef {
  return {
    id,
    name,
    hp: Math.round(hp * s.scale),
    damage: Math.round(damage * s.scale),
    // Elemental enemies and casters hit with Magic, everyone else with Power.
    damageType: damageType ?? (element ? 'magic' : 'power'),
    speed: enemySpeed(s.tier, speedClass),
    element,
    tags,
    ...(enemyArmour(name, tags, s.tier) !== undefined ? { armour: enemyArmour(name, tags, s.tier) } : {}),
  };
}

function boss(
  id: string,
  name: string,
  s: Strength,
  hp: number,
  damage: number,
  tags: Tag[] = [],
  effect?: BossDef['effect'],
  element?: Element,
  speedClass: SpeedClass = 'normal',
  damageType?: DamageStat,
): BossDef {
  return { ...mob(id, name, s, hp, damage, tags, element, speedClass, damageType), effect };
}

const S = {
  // Tier 1
  ratCellar: strength(1, D('ratCellar', 2.50)),
  spiderBurrow: strength(1, D('spiderBurrow', 2.70)),
  oldGraveyard: strength(1, D('oldGraveyard', 2.15)),
  goblinWarren: strength(1, D('goblinWarren', 4.22)),
  millRuins: strength(1, D('millRuins', 4.37)),
  smugglersCove: strength(1, D('smugglersCove', 4.29)),
  banditStockade: strength(1, 3.95),
  // The bandit captain alone: ×0.9, aimed at about 55% for the full game's rosters (the reference team is far below).
  banditStockadeBoss: strength(1, 3.77),
  // Tier 2
  wolfDen: strength(2, D('wolfDen', 4.14)),
  barrowMounds: strength(2, D('barrowMounds', 3.32)),
  boarThicket: strength(2, D('boarThicket', 3.97)),
  trollBridge: strength(2, D('trollBridge', 3.61)),
  sunkenFord: strength(2, D('sunkenFord', 2.67)),
  watchtower: strength(2, D('watchtower', 3.72)),
  ogreQuarry: strength(2, 3.36),
  // Tier 3
  hauntedMine: strength(3, D('hauntedMine', 3.49)),
  fungalGrotto: strength(3, D('fungalGrotto', 3.04)),
  stormRidge: strength(3, D('stormRidge', 2.68)),
  cinderHollow: strength(3, D('cinderHollow', 2.60)),
  dwarfhold: strength(3, D('dwarfhold', 2.63)),
  witchMarsh: strength(3, D('witchMarsh', 2.65)),
  drownedCrypt: strength(3, 3.11),
  // Tier 4
  harpyCliffs: strength(4, D('harpyCliffs', 3.42)),
  thunderPlateau: strength(4, D('thunderPlateau', 2.28)),
  boneField: strength(4, D('boneField', 3.39)),
  orcWarcamp: strength(4, D('orcWarcamp', 2.81)),
  clockworkVault: strength(4, D('clockworkVault', 2.79)),
  frozenLake: strength(4, D('frozenLake', 2.27)),
  giantsHall: strength(4, D('giantsHall', 2.81)),
  // Tier 5
  wyvernPeaks: strength(5, D('wyvernPeaks', 3.10)),
  ossuary: strength(5, D('ossuary', 3.11)),
  stormIsle: strength(5, D('stormIsle', 2.05)),
  ashenCitadel: strength(5, D('ashenCitadel', 2.07)),
  abyssalDepths: strength(5, D('abyssalDepths', 1.74)),
  titanRuins: strength(5, D('titanRuins', 2.13)),
  dragonLair: strength(5, 1.94),
  // The elder dragon alone: eased so the reference team beats it about 55% of the time.
  dragonLairBoss: strength(5, D('dragonLairBoss', 1.16)),
  // Overnight expeditions: a long, safe patrol at low strength (see overnightExpeditionRules).
  nightWatch1: strength(1, 1.7),
  nightWatch2: strength(2, 2.5),
  nightWatch3: strength(3, 2.3),
  nightWatch4: strength(4, 2.35),
  nightWatch5: strength(5, 2.05),
};

export const mobs: MobDef[] = [
  // Tier 1
  mob('giantRat', 'giant rat', S.ratCellar, 8, 3, ['beast'], undefined, 'fast'),
  mob('cellarSpider', 'cellar spider', S.ratCellar, 12, 4, ['vermin', 'beast']),
  mob('ratSwarm', 'rat swarm', S.ratCellar, 18, 5, ['vermin', 'beast'], undefined, 'slow'),
  mob('webling', 'webling', S.spiderBurrow, 8, 3, ['vermin', 'beast'], undefined, 'fast'),
  mob('burrowSpider', 'burrow spider', S.spiderBurrow, 12, 4, ['vermin', 'beast']),
  mob('broodGuard', 'brood guard', S.spiderBurrow, 18, 5, ['vermin', 'beast']),
  mob('restlessBones', 'restless bones', S.oldGraveyard, 8, 3, ['undead']),
  mob('graveRobber', 'grave robber', S.oldGraveyard, 12, 4, ['humanoid']),
  mob('ghoul', 'ghoul', S.oldGraveyard, 18, 5, ['undead']),
  mob('goblinRunt', 'goblin runt', S.goblinWarren, 8, 3, ['goblinoid'], undefined, 'fast'),
  mob('goblin', 'goblin', S.goblinWarren, 14, 4, ['goblinoid']),
  mob('goblinSlinger', 'goblin slinger', S.goblinWarren, 14, 5, ['goblinoid']),
  mob('millRat', 'mill rat', S.millRuins, 8, 3, ['beast'], undefined, 'fast'),
  mob('squatter', 'squatter', S.millRuins, 14, 4, ['humanoid']),
  mob('millBrute', 'mill brute', S.millRuins, 16, 5, ['humanoid'], undefined, 'slow'),
  mob('cutpurse', 'cutpurse', S.smugglersCove, 8, 3, ['humanoid'], undefined, 'fast'),
  mob('smuggler', 'smuggler', S.smugglersCove, 14, 4, ['humanoid']),
  mob('coveEnforcer', 'cove enforcer', S.smugglersCove, 16, 5, ['humanoid']),
  mob('guardDog', 'guard dog', S.banditStockade, 10, 4, ['beast'], undefined, 'fast'),
  mob('bandit', 'bandit', S.banditStockade, 16, 5, ['humanoid']),
  mob('banditArcher', 'bandit archer', S.banditStockade, 16, 6, ['humanoid']),
  // Tier 2
  mob('wolfPup', 'wolf pup', S.wolfDen, 8, 3, ['beast'], undefined, 'fast'),
  mob('greyWolf', 'grey wolf', S.wolfDen, 14, 4, ['beast'], undefined, 'fast'),
  mob('direWolf', 'dire wolf', S.wolfDen, 20, 5, ['beast'], undefined, 'fast'),
  mob('barrowRat', 'barrow rat', S.barrowMounds, 8, 3, ['beast'], undefined, 'fast'),
  mob('barrowWight', 'barrow wight', S.barrowMounds, 14, 4, ['spirit', 'undead'], undefined, 'normal', 'magic'),
  mob('mouldKnight', 'mould knight', S.barrowMounds, 20, 5, ['undead'], undefined, 'slow'),
  mob('thornPiglet', 'thorn piglet', S.boarThicket, 8, 3, ['beast'], 'grass'),
  mob('wildBoar', 'wild boar', S.boarThicket, 14, 4, ['beast'], 'grass', 'slow'),
  mob('briarTusker', 'briar tusker', S.boarThicket, 20, 5, ['beast'], 'grass', 'slow'),
  mob('bogHound', 'bog hound', S.trollBridge, 10, 4, ['beast'], undefined, 'fast'),
  mob('highwayBandit', 'bandit', S.trollBridge, 16, 5, ['humanoid']),
  mob('riverTroll', 'river troll', S.trollBridge, 24, 6, ['brute'], undefined, 'slow'),
  mob('fordLeech', 'ford leech', S.sunkenFord, 8, 3, ['vermin', 'beast'], 'water', 'slow'),
  mob('riverSprite', 'river sprite', S.sunkenFord, 14, 4, ['elemental'], 'water'),
  mob('drownedSoldier', 'drowned soldier', S.sunkenFord, 20, 5, ['undead'], 'water'),
  mob('towerCrow', 'tower crow', S.watchtower, 8, 3, ['bird', 'beast'], undefined, 'fast'),
  mob('deserter', 'deserter', S.watchtower, 16, 5, ['humanoid']),
  mob('towerSergeant', 'tower sergeant', S.watchtower, 22, 6, ['humanoid']),
  mob('ogreBrute', 'ogre brute', S.ogreQuarry, 12, 4, ['brute']),
  mob('rockGolem', 'rock golem', S.ogreQuarry, 20, 5, ['construct']),
  mob('quarryOgre', 'quarry ogre', S.ogreQuarry, 24, 6, ['brute']),
  // Tier 3
  mob('ghostBat', 'ghost bat', S.hauntedMine, 8, 3, ['spirit', 'bird', 'beast', 'undead'], undefined, 'fast'),
  mob('skeletonMiner', 'skeleton miner', S.hauntedMine, 14, 4, ['undead']),
  mob('mineGhost', 'mine ghost', S.hauntedMine, 20, 5, ['spirit', 'undead'], undefined, 'normal', 'magic'),
  mob('sporeling', 'sporeling', S.fungalGrotto, 8, 3, ['vermin', 'beast'], 'grass', 'fast'),
  mob('capCrawler', 'cap crawler', S.fungalGrotto, 14, 4, ['carapace', 'beast'], 'grass'),
  mob('mycelTroll', 'mycel troll', S.fungalGrotto, 22, 5, ['brute'], 'grass', 'slow'),
  mob('sparkMoth', 'spark moth', S.stormRidge, 8, 3, ['vermin', 'beast'], 'electric', 'fast'),
  mob('stormHawk', 'storm hawk', S.stormRidge, 14, 4, ['bird', 'beast'], 'electric', 'fast'),
  mob('boltElemental', 'bolt elemental', S.stormRidge, 20, 5, ['elemental'], 'electric'),
  mob('fireImp', 'fire imp', S.cinderHollow, 8, 3, ['elemental'], 'fire', 'fast'),
  mob('magmaSlug', 'magma slug', S.cinderHollow, 16, 4, ['vermin', 'beast'], 'fire', 'slow'),
  mob('emberHound', 'ember hound', S.cinderHollow, 18, 5, ['beast'], 'fire', 'fast'),
  mob('tunnelBeetle', 'tunnel beetle', S.dwarfhold, 10, 3, ['carapace', 'beast']),
  mob('stoneWarden', 'stone warden', S.dwarfhold, 16, 4, ['construct'], 'stone', 'slow'),
  mob('runeGolem', 'rune golem', S.dwarfhold, 24, 5, ['construct'], 'stone', 'slow'),
  mob('marshToad', 'marsh toad', S.witchMarsh, 8, 3, ['vermin', 'beast'], 'grass'),
  mob('bogling', 'bogling', S.witchMarsh, 14, 4, ['goblinoid'], 'grass'),
  mob('hexedHunter', 'hexed hunter', S.witchMarsh, 18, 5, ['humanoid']),
  mob('cryptEel', 'crypt eel', S.drownedCrypt, 10, 4, ['beast']),
  mob('drownedDead', 'drowned dead', S.drownedCrypt, 16, 5, ['undead']),
  mob('boneKnight', 'bone knight', S.drownedCrypt, 22, 6, ['undead']),
  // Tier 4
  mob('rockLizard', 'rock lizard', S.harpyCliffs, 8, 3, ['dragon', 'beast'], undefined, 'fast'),
  mob('cliffEagle', 'cliff eagle', S.harpyCliffs, 12, 4, ['bird', 'beast'], undefined, 'fast'),
  mob('harpy', 'harpy', S.harpyCliffs, 18, 5, ['bird', 'beast'], undefined, 'fast'),
  mob('stormRam', 'storm ram', S.thunderPlateau, 10, 3, ['beast'], 'electric'),
  mob('thunderbird', 'thunderbird', S.thunderPlateau, 14, 4, ['bird', 'beast'], 'electric', 'fast'),
  mob('skyfallGolem', 'skyfall golem', S.thunderPlateau, 22, 5, ['construct'], 'electric', 'slow'),
  mob('boneCrawler', 'bone crawler', S.boneField, 8, 3, ['undead', 'carapace']),
  mob('fallenLegionary', 'fallen legionary', S.boneField, 16, 5, ['undead']),
  mob('deathCaptain', 'death captain', S.boneField, 22, 6, ['undead']),
  mob('orcGrunt', 'orc grunt', S.orcWarcamp, 12, 4, ['goblinoid']),
  mob('orcRaider', 'orc raider', S.orcWarcamp, 16, 5, ['goblinoid']),
  mob('orcShaman', 'orc shaman', S.orcWarcamp, 16, 6, ['goblinoid', 'caster'], undefined, 'normal', 'magic'),
  mob('brassBeetle', 'brass beetle', S.clockworkVault, 10, 3, ['construct', 'carapace']),
  mob('clockworkGuard', 'clockwork guard', S.clockworkVault, 16, 5, ['construct']),
  mob('vaultAutomaton', 'vault automaton', S.clockworkVault, 24, 6, ['construct'], undefined, 'slow'),
  mob('iceSeal', 'ice seal', S.frozenLake, 10, 3, ['beast'], 'water', 'slow'),
  mob('frostNymph', 'frost nymph', S.frozenLake, 14, 4, ['elemental'], 'water'),
  mob('lakeSerpent', 'lake serpent', S.frozenLake, 22, 6, ['dragon', 'beast'], 'water'),
  mob('giantHound', 'giant hound', S.giantsHall, 12, 4, ['beast'], undefined, 'fast'),
  mob('stoneSentinel', 'stone sentinel', S.giantsHall, 20, 5, ['construct'], undefined, 'slow'),
  mob('hillGiant', 'hill giant', S.giantsHall, 26, 7, ['brute'], undefined, 'slow'),
  // Tier 5
  mob('frostWolf', 'frost wolf', S.wyvernPeaks, 10, 4, ['beast'], undefined, 'fast'),
  mob('mountainTroll', 'mountain troll', S.wyvernPeaks, 20, 5, ['brute'], undefined, 'slow'),
  mob('wyvern', 'wyvern', S.wyvernPeaks, 22, 6, ['dragon', 'beast'], undefined, 'fast'),
  mob('cryptGuard', 'crypt guard', S.ossuary, 10, 4, ['undead']),
  mob('boneLord', 'bone lord', S.ossuary, 18, 5, ['undead']),
  mob('deathKnight', 'death knight', S.ossuary, 24, 6, ['undead'], undefined, 'slow'),
  mob('stormEel', 'storm eel', S.stormIsle, 10, 4, ['beast'], 'electric', 'fast'),
  mob('tempestCaller', 'tempest caller', S.stormIsle, 18, 5, ['caster'], 'electric'),
  mob('thunderDrake', 'thunder drake', S.stormIsle, 22, 6, ['dragon', 'beast'], 'electric', 'fast'),
  mob('flameCultist', 'flame cultist', S.ashenCitadel, 10, 4, ['caster', 'humanoid'], 'fire'),
  mob('cinderGolem', 'cinder golem', S.ashenCitadel, 20, 5, ['construct'], 'fire', 'slow'),
  mob('ashKnight', 'ash knight', S.ashenCitadel, 22, 6, ['undead'], 'fire'),
  mob('deepAngler', 'deep angler', S.abyssalDepths, 10, 4, ['beast'], 'water'),
  mob('abyssalPriest', 'abyssal priest', S.abyssalDepths, 18, 5, ['caster'], 'water'),
  mob('krakenSpawn', 'kraken spawn', S.abyssalDepths, 24, 6, ['beast'], 'water', 'slow'),
  mob('ruinCrawler', 'ruin crawler', S.titanRuins, 10, 4, ['carapace', 'beast']),
  mob('titanShard', 'titan shard', S.titanRuins, 18, 5, ['construct'], 'stone', 'slow'),
  mob('colossusArm', 'colossus arm', S.titanRuins, 24, 6, ['construct'], 'stone', 'slow'),
  mob('dragonCultist', 'dragon cultist', S.dragonLair, 12, 4, ['caster', 'humanoid'], 'fire'),
  mob('drake', 'drake', S.dragonLair, 20, 6, ['dragon', 'beast'], 'fire', 'fast'),
  mob('fireElemental', 'fire elemental', S.dragonLair, 22, 6, ['elemental'], 'fire'),
];

export const bosses: BossDef[] = [
  boss('ratKing', 'rat king', S.ratCellar, 45, 6, ['vermin', 'beast']),
  boss('broodMother', 'brood mother', S.spiderBurrow, 45, 6, ['vermin', 'beast'], undefined, undefined, 'slow'),
  boss('graveLord', 'grave lord', S.oldGraveyard, 45, 6, ['undead', 'caster'], undefined, undefined, 'normal', 'magic'),
  boss('goblinChief', 'goblin chief', S.goblinWarren, 60, 7, ['goblinoid']),
  boss('millOgre', 'mill ogre', S.millRuins, 60, 7, ['brute'], undefined, undefined, 'slow'),
  boss('smugglerQueen', 'smuggler queen', S.smugglersCove, 60, 7, ['humanoid']),
  boss('banditCaptain', 'bandit captain', S.banditStockadeBoss, 110, 9, ['humanoid'], 'enrage'),
  boss('alphaWolf', 'alpha wolf', S.wolfDen, 55, 7, ['beast'], undefined, undefined, 'fast'),
  boss('barrowKing', 'barrow king', S.barrowMounds, 55, 7, ['spirit', 'undead']),
  boss('thicketBoar', 'great thicket boar', S.boarThicket, 55, 7, ['beast'], undefined, 'grass', 'slow'),
  boss('bridgeTroll', 'bridge troll', S.trollBridge, 70, 8, ['brute'], undefined, undefined, 'slow'),
  boss('fordHag', 'ford hag', S.sunkenFord, 70, 8, ['caster'], undefined, 'water'),
  boss('turncoatKnight', 'turncoat knight', S.watchtower, 70, 8, ['humanoid']),
  boss('ogreChieftain', 'ogre chieftain', S.ogreQuarry, 120, 10, ['brute'], 'sweep', undefined, 'slow'),
  boss('mineWraith', 'mine wraith', S.hauntedMine, 55, 7, ['spirit', 'undead'], undefined, undefined, 'normal', 'magic'),
  boss('sporeQueen', 'spore queen', S.fungalGrotto, 55, 7, ['vermin'], undefined, 'grass'),
  boss('stormRoc', 'storm roc', S.stormRidge, 55, 7, ['bird', 'beast'], undefined, 'electric', 'fast'),
  boss('ashWyrm', 'ash wyrm', S.cinderHollow, 70, 8, ['dragon', 'beast'], undefined, 'fire'),
  boss('forgeGuardian', 'forge guardian', S.dwarfhold, 70, 8, ['construct'], undefined, 'stone', 'slow'),
  boss('marshWitch', 'marsh witch', S.witchMarsh, 70, 8, ['caster'], 'enrage', 'grass'),
  boss('lichOfTheDeep', 'lich of the deep', S.drownedCrypt, 125, 10, ['undead', 'caster'], 'enrage', undefined, 'normal', 'magic'),
  boss('harpyMatriarch', 'harpy matriarch', S.harpyCliffs, 55, 7, ['bird', 'beast'], 'sweep', undefined, 'fast'),
  boss('thunderTitan', 'thunder titan', S.thunderPlateau, 55, 7, ['brute'], 'sweep', 'electric', 'slow'),
  boss('boneGeneral', 'bone general', S.boneField, 55, 7, ['undead'], 'enrage'),
  boss('orcWarlord', 'orc warlord', S.orcWarcamp, 75, 8, ['goblinoid'], 'enrage'),
  boss('clockworkWarden', 'clockwork warden', S.clockworkVault, 75, 8, ['construct'], 'sweep', undefined, 'slow'),
  boss('iceWyrm', 'ice wyrm', S.frozenLake, 75, 8, ['dragon', 'beast'], undefined, 'water'),
  boss('giantKing', 'giant king', S.giantsHall, 130, 11, ['brute'], 'sweep', undefined, 'slow'),
  boss('wyvernQueen', 'wyvern queen', S.wyvernPeaks, 60, 8, ['dragon', 'beast'], 'sweep', undefined, 'fast'),
  boss('ossuaryKing', 'ossuary king', S.ossuary, 60, 8, ['undead'], 'enrage'),
  boss('stormcaller', 'stormcaller', S.stormIsle, 60, 8, ['caster'], 'sweep', 'electric'),
  boss('ashLord', 'ash lord', S.ashenCitadel, 80, 9, ['caster'], 'enrage', 'fire'),
  boss('abyssalHorror', 'abyssal horror', S.abyssalDepths, 80, 9, ['beast'], 'sweep', 'water', 'slow'),
  boss('titanHeart', 'titan heart', S.titanRuins, 80, 9, ['construct'], 'enrage', 'stone', 'slow'),
  boss('elderDragon', 'elder dragon', S.dragonLairBoss, 140, 12, ['dragon', 'beast'], 'sweep', 'fire'),
  // Underwater dungeons' elites (secret places): water and drowned foes, never a tier boss.
  boss('drownedEnforcer', 'drowned enforcer', S.smugglersCove, 50, 6, ['undead', 'humanoid'], undefined, 'water'),
  boss('drownedSergeant', 'drowned sergeant', S.sunkenFord, 60, 7, ['undead'], undefined, 'water'),
  boss('barnacledKnight', 'barnacled knight', S.drownedCrypt, 70, 8, ['undead'], undefined, 'water'),
  boss('elderSerpent', 'elder lake serpent', S.frozenLake, 70, 8, ['dragon', 'beast'], undefined, 'water'),
  boss('krakenBrood', 'kraken brood', S.abyssalDepths, 75, 9, ['beast'], 'sweep', 'water', 'slow'),
  // The overnight expeditions' patrol leaders: the run's only real threat.
  boss('nightProwler', 'night prowler', S.nightWatch1, 120, 20, ['beast'], undefined, undefined, 'fast'),
  boss('roadStalker', 'road stalker', S.nightWatch2, 65, 12, ['beast'], undefined, undefined, 'fast'),
  boss('shaftHaunt', 'shaft haunt', S.nightWatch3, 65, 12, ['spirit', 'undead'], undefined, undefined, 'normal', 'magic'),
  boss('campRaider', 'camp raider', S.nightWatch4, 65, 12, ['humanoid']),
  boss('ashStalker', 'ash stalker', S.nightWatch5, 65, 12, ['spirit'], undefined, 'fire', 'fast'),
];

// Patrols: the small roaming groups home heroes fight on the map (see
// content/patrols.ts). Template stats are scaled like dungeon enemies, by tier
// and a factor per kind and tier, tuned so a hero in the tier's Normal gear at
// the expected level beats goblins and herds alone ~90% of the time at full HP
// (15% weaker than the first ~85% tuning, since players mostly wear Crappy
// gear), and a pair beats bandits ~75% (see patrols/fight.test.ts).
const PATROL_ROLES = ['weak', 'normal', 'boss'] as const;
type PatrolRole = (typeof PATROL_ROLES)[number];

/** Elite patrols, the rarer tougher roll; their rewards are in content/patrols.ts. */
const PATROL_ELITE = { hp: 1.25, damage: 1.12 };

/** A named foe in a patrol or place template, with the tags the template's own tags don't supply. */
type Foe = { name: string; tags: Tag[] };

const foe = (name: string, ...tags: Tag[]): Foe => ({ name, tags });

/** A foe's tags: its own, then the template's, in an order that keeps the CSV's. */
const foeTags = (f: Foe, templateTags: Tag[]) => [...f.tags, ...templateTags.filter((t) => !f.tags.includes(t))];

const BANDIT_FOES: Foe[][] = [
  [foe('cutpurse', 'humanoid'), foe('bandit', 'humanoid'), foe('bandit archer', 'humanoid')],
  [foe('deserter', 'humanoid'), foe('bandit', 'humanoid'), foe('tower sergeant', 'humanoid')],
  [foe('bogling', 'goblinoid'), foe('hexed hunter', 'humanoid'), foe('bone knight', 'humanoid')],
  [foe('fallen legionary', 'humanoid'), foe('orc raider', 'goblinoid'), foe('death captain', 'humanoid')],
  [foe('flame cultist', 'caster', 'humanoid'), foe('abyssal priest', 'caster'), foe('death knight', 'humanoid')],
];

const GOBLIN_FOES: Foe[][] = [
  [foe('goblin runt', 'goblinoid'), foe('goblin', 'goblinoid'), foe('goblin slinger', 'goblinoid')],
  [foe('squatter', 'humanoid'), foe('smuggler', 'humanoid'), foe('turncoat knight', 'humanoid')],
  [foe('fire imp', 'elemental'), foe('hexed hunter', 'humanoid'), foe('stone warden', 'construct')],
  [foe('orc grunt', 'goblinoid'), foe('brass beetle', 'construct', 'carapace'), foe('vault automaton', 'construct')],
  [foe('ruin crawler', 'carapace'), foe('mountain troll', 'brute'), foe('ash knight', 'humanoid')],
];

const HERD_FOES: Foe[][] = [
  [foe('giant rat'), foe('cellar spider', 'vermin'), foe('rat swarm', 'vermin')],
  [foe('wolf pup'), foe('grey wolf'), foe('dire wolf')],
  [foe('ghost bat', 'spirit', 'bird'), foe('spark moth', 'vermin'), foe('ember hound')],
  [foe('rock lizard', 'dragon'), foe('storm ram'), foe('thunderbird', 'bird')],
  [foe('frost wolf'), foe('storm eel'), foe('wyvern', 'dragon')],
];

const ORC_FOES: Foe[][] = [
  [foe('orc grunt', 'goblinoid'), foe('orc warrior'), foe('orc warboss')],
  [foe('orc marauder'), foe('orc raider', 'goblinoid'), foe('orc chieftain', 'humanoid')],
  [foe('orc veteran'), foe('orc champion'), foe('orc warlord')],
];

const SPIDER_FOES: Foe[][] = [
  [foe('spiderling'), foe('web spider'), foe('brood mother')],
  [foe('web weaver'), foe('giant spider'), foe('spider matriarch')],
  [foe('venom crawler'), foe('shadow spider'), foe('spider queen')],
];

const OGRES_FOES: Foe[][] = [
  [foe('ogre whelp'), foe('ogre brute'), foe('ogre bull')],
  [foe('swamp ogre'), foe('ogre basher'), foe('ogre chief')],
  [foe('hill ogre'), foe('ogre ravager'), foe('ogre tyrant')],
];

const TROLL_FOES: Foe[][] = [
  [foe('troll cub'), foe('river troll', 'brute'), foe('troll matriarch')],
  [foe('cave troll'), foe('stone troll'), foe('troll champion')],
  [foe('frost troll'), foe('elder troll'), foe('troll king')],
];

const WRAITH_FOES: Foe[][] = [
  [foe('shade'), foe('wraith'), foe('barrow wraith')],
  [foe('hollow shade'), foe('grim wraith'), foe('wraith lord')],
  [foe('phantom'), foe('dread wraith'), foe('wraith king')],
];

const WYVERN_FOES: Foe[][] = [
  [foe('wyvern hatchling'), foe('wyvern'), foe('wyvern broodmother')],
  [foe('gale wyvern'), foe('ember wyvern'), foe('wyvern matriarch')],
  [foe('storm wyvern'), foe('wyvern alpha'), foe('elder wyvern')],
];

const GOLEM_FOES: Foe[][] = [
  [foe('clay golem'), foe('stone golem'), foe('guardian golem')],
  [foe('iron golem'), foe('rune golem'), foe('colossus golem')],
  [foe('obsidian golem'), foe('war golem'), foe('golem overlord')],
];

type PatrolTemplate = {
  /** Stats for [weak, normal, boss] at tier-1 strength. */
  hp: [number, number, number];
  damage: [number, number, number];
  tags: Tag[];
  /** Foes for [weak, normal, boss], one row per tier; the last row repeats for the tiers beyond it. */
  foes: Foe[][];
  /** One mob set per element instead of a single set. */
  elemental?: boolean;
};

/** The kinds that fight with the elite mob variant (see PATROL_ELITE). */
export const ELITE_PATROL_KINDS = ['eliteGoblins', 'outlaws', 'eliteOrcs'] as const;

export const isElitePatrolKind = (kind: PatrolKind): boolean => ((ELITE_PATROL_KINDS as readonly string[]).includes(kind));

/** The template each kind fights with; the elite kinds borrow their base kind's. */
const PATROL_TEMPLATE_OF: Record<PatrolKind, Exclude<PatrolKind, (typeof ELITE_PATROL_KINDS)[number]>> = {
  goblins: 'goblins',
  eliteGoblins: 'goblins',
  herd: 'herd',
  wolves: 'wolves',
  bandits: 'bandits',
  outlaws: 'bandits',
  orcs: 'orcs',
  eliteOrcs: 'orcs',
  spiders: 'spiders',
  ogres: 'ogres',
  trolls: 'trolls',
  wraiths: 'wraiths',
  wyverns: 'wyverns',
  golems: 'golems',
};

const patrolTemplates: Record<Exclude<PatrolKind, (typeof ELITE_PATROL_KINDS)[number]>, PatrolTemplate> = {
  goblins: {
    hp: [7, 10, 14],
    damage: [2, 3, 4],
    tags: ['locals'],
    foes: GOBLIN_FOES,
  },
  herd: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: ['beast'],
    foes: HERD_FOES,
  },
  wolves: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: ['beast'],
    foes: HERD_FOES,
  },
  bandits: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['locals'],
    foes: BANDIT_FOES,
  },
  orcs: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['brute'],
    foes: ORC_FOES,
  },
  spiders: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: ['vermin'],
    foes: SPIDER_FOES,
  },
  ogres: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['brute'],
    foes: OGRES_FOES,
  },
  trolls: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['brute'],
    foes: TROLL_FOES,
  },
  wraiths: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['spirit'],
    foes: WRAITH_FOES,
  },
  wyverns: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['dragon'],
    foes: WYVERN_FOES,
    elemental: true,
  },
  golems: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['construct'],
    foes: GOLEM_FOES,
  },
};

/** A patrol mob, or its elite variant, by kind, tier and role. */
export const patrolMobId = (kind: PatrolKind, tier: number, role: PatrolRole, elite = false, element?: Element) =>
  `patrol:${kind}:${tier}:${role}${elite ? ':elite' : ''}${element ? `:${element}` : ''}`;

const patrolMobs: MobDef[] = (Object.keys(PATROL_TEMPLATE_OF) as PatrolKind[]).flatMap((kind) => {
  const { hp, damage, tags, foes, elemental } = patrolTemplates[PATROL_TEMPLATE_OF[kind]];
  // The kind's own fitted factors, one per tier (see content/difficultyFactors.ts).
  const factors = patrolFactors[kind];
  // Beasts charge; everyone else keeps pace with heroes.
  const speedClass: SpeedClass = tags.includes('beast') ? 'fast' : 'normal';
  const elements = elemental ? [...ELEMENTS] : [undefined];
  return TIER_SCALE.flatMap((_, i) =>
    foes[Math.min(i, foes.length - 1)].flatMap((f, role) =>
      elements.flatMap((element) => [
        mob(patrolMobId(kind, i + 1, PATROL_ROLES[role], false, element), f.name, strength(i + 1, factors[i]), hp[role], damage[role], foeTags(f, tags), element, speedClass),
        mob(
          patrolMobId(kind, i + 1, PATROL_ROLES[role], true, element),
          f.name,
          strength(i + 1, factors[i]),
          hp[role] * PATROL_ELITE.hp,
          damage[role] * PATROL_ELITE.damage,
          foeTags(f, tags),
          element,
          speedClass,
        ),
      ]),
    ),
  );
});

// Fight events and the monster lair: the fixed enemies home heroes fight at
// map places (see content/placeFights.ts). Templates work like patrol ones;
// each kind's fitted factors are in content/difficultyFactors.ts.
type PlaceTemplate = {
  /** Stats for [weak, normal, boss] at tier-1 strength. */
  hp: [number, number, number];
  damage: [number, number, number];
  tags: Tag[];
  /** Foes for [weak, normal, boss], one row per tier. */
  foes: Foe[][];
  /** One mob set per element instead of a single set. */
  elemental?: boolean;
};

const placeTemplates: Record<FightPlaceKind, PlaceTemplate> = {
  banditCamp: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['locals'],
    foes: BANDIT_FOES,
  },
  goblinRaid: {
    hp: [7, 10, 14],
    damage: [2, 3, 4],
    tags: ['locals'],
    foes: GOBLIN_FOES,
  },
  beastDen: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: ['beast'],
    foes: HERD_FOES,
  },
  hauntedCrypt: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: ['undead'],
    foes: [
      [foe('restless bones'), foe('grave robber', 'humanoid'), foe('ghoul')],
      [foe('barrow wight', 'spirit'), foe('drowned soldier'), foe('mould knight')],
      [foe('skeleton miner'), foe('drowned dead'), foe('bone knight')],
      [foe('bone crawler', 'undead', 'carapace'), foe('fallen legionary'), foe('death captain')],
      [foe('crypt guard'), foe('bone lord'), foe('death knight')],
    ],
  },
  elementalRift: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: [],
    elemental: true,
    foes: [
      [foe('ember whelp', 'dragon'), foe('ember sprite', 'elemental'), foe('rift spawn', 'elemental')],
      [foe('mud mephit', 'elemental'), foe('mud brute', 'brute'), foe('rift horror', 'elemental')],
      [foe('spark imp', 'elemental'), foe('spark elemental', 'elemental'), foe('rift caller', 'caster')],
      [foe('gale wisp', 'elemental'), foe('gale elemental', 'elemental'), foe('rift warden', 'construct')],
      [foe('void whelp', 'dragon'), foe('void elemental', 'elemental'), foe('rift tyrant', 'brute')],
    ],
  },
  abandonedCaravan: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['locals'],
    foes: BANDIT_FOES,
  },
  wantedOutlaw: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['locals'],
    foes: BANDIT_FOES,
  },
  monsterLair: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['beast'],
    foes: [
      [foe('giant rat'), foe('ghoul'), foe('rat king', 'vermin')],
      [foe('bog hound'), foe('river troll', 'brute'), foe('barrow king', 'spirit')],
      [foe('ember hound'), foe('mycel troll', 'brute'), foe('ash wyrm', 'dragon')],
      [foe('giant hound'), foe('hill giant', 'brute'), foe('harpy matriarch', 'bird')],
      [foe('frost wolf'), foe('mountain troll', 'brute'), foe('wyvern queen', 'dragon')],
    ],
  },
};

/** A place fight mob, or its elite variant, by kind, tier, role and element. */
export const placeMobId = (kind: FightPlaceKind, tier: number, role: 'weak' | 'normal' | 'boss', elite = false, element?: Element) =>
  `place:${kind}:${tier}:${role}${elite ? ':elite' : ''}${element ? `:${element}` : ''}`;

const placeMobs: MobDef[] = (Object.keys(placeTemplates) as FightPlaceKind[]).flatMap((kind) => {
  const { hp, damage, tags, foes, elemental } = placeTemplates[kind];
  // The kind's own fitted factors, one per tier (see content/difficultyFactors.ts).
  const factors = placeFactors[kind];
  // Beasts charge; everyone else keeps pace with heroes.
  const speedClass: SpeedClass = tags.includes('beast') ? 'fast' : 'normal';
  const elements = elemental ? [...ELEMENTS] : [undefined];
  return foes.flatMap((tierFoes, i) =>
    tierFoes.flatMap((f, role) =>
      elements.flatMap((element) => [
        mob(
          placeMobId(kind, i + 1, PATROL_ROLES[role], false, element),
          f.name,
          strength(i + 1, factors[i]),
          hp[role],
          damage[role],
          foeTags(f, tags),
          element,
          speedClass,
        ),
        mob(
          placeMobId(kind, i + 1, PATROL_ROLES[role], true, element),
          f.name,
          strength(i + 1, factors[i]),
          hp[role] * PATROL_ELITE.hp,
          damage[role] * PATROL_ELITE.damage,
          foeTags(f, tags),
          element,
          speedClass,
        ),
      ]),
    ),
  );
});

// Sanctum enemies: one set per Sigil tier, scaled like dungeon enemies.
const sanctumScale = (tier: number) => strength(tier, sanctumRules.tierStrength[tier - 1]);

export const sanctumMinionId = (sanctumId: string, which: 'weak' | 'strong', tier: number) =>
  `${sanctumId}:${which}:${tier}`;

const sanctumMinions: MobDef[] = sanctums.flatMap((sanctum) =>
  sanctumRules.tierStrength.flatMap((_, i) =>
    (['weak', 'strong'] as const).map((which, j) => {
      const { hp, damage } = sanctumRules.minionBase[which];
      return mob(sanctumMinionId(sanctum.id, which, i + 1), sanctum.minions[j].name, sanctumScale(i + 1), hp, damage, sanctum.minions[j].tags, sanctum.element);
    }),
  ),
);

/** A Sanctum's guardian at a Sigil tier. */
export function sanctumGuardian(sanctum: SanctumDef, tier: number): BossDef {
  const { hp, damage } = sanctumRules.guardianBase;
  return boss(`${sanctum.id}:guardian:${tier}`, sanctum.guardian.name, sanctumScale(tier), hp, damage, sanctum.guardian.tags, sanctum.guardian.effect, sanctum.element);
}

export const mobById = Object.fromEntries([...mobs, ...sanctumMinions, ...patrolMobs, ...placeMobs].map((m) => [m.id, m]));
export const bossById = Object.fromEntries(bosses.map((b) => [b.id, b]));
