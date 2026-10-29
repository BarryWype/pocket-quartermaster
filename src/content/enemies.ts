import type { PatrolKind } from '@/game/patrols/generate';
import type { FightPlaceKind } from '@/content/placeFights';
import { ELEMENTS, type Element } from '@/game/elements';
import type { BossDef, DamageStat, MobDef, SanctumDef, SpeedClass, Tag } from '@/game/types';

import { npcs } from './npcs';
import { sanctumRules, sanctums } from './sanctums';

/** An enemy's Speed from its class and tier: the class base, plus one per tier above the first. */
export const enemySpeedRules: Record<SpeedClass, number> & { speedPerTier: number } = {
  slow: 3,
  normal: 5,
  fast: 7,
  speedPerTier: 1,
};

// Enemies are written at tier 1 strength, then scaled by their tier and by how
// tough their dungeon should be within it. Per-dungeon strengths are tuned so
// that, with the tier's full kit at the expected level, short dungeons succeed
// well over 65% of the time, long ones over 45% and bosses 30–60% (see
// src/game/balance/balance.test.ts).
export const TIER_SCALE = [1, 1.9, 3, 4.2, 5.6];

/** A dungeon's scaling, with its tier for enemy Speed. */
type Strength = { tier: number; scale: number };

const strength = (tier: number, dungeonFactor: number): Strength => ({ tier, scale: TIER_SCALE[tier - 1] * dungeonFactor });

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

/** A mob's tags, with its element as a tag too. */
export const mobTags = (mob: MobDef): Tag[] => (mob.element ? [...mob.tags, mob.element] : mob.tags);

const S = {
  // Tier 1
  ratCellar: strength(1, 1.58),
  spiderBurrow: strength(1, 1.68),
  oldGraveyard: strength(1, 1.34),
  goblinWarren: strength(1, 3.50),
  millRuins: strength(1, 3.57),
  smugglersCove: strength(1, 3.51),
  banditStockade: strength(1, 2.25),
  // Tier 2
  wolfDen: strength(2, 3.08),
  barrowMounds: strength(2, 2.49),
  boarThicket: strength(2, 2.80),
  trollBridge: strength(2, 2.79),
  sunkenFord: strength(2, 2.09),
  watchtower: strength(2, 2.71),
  ogreQuarry: strength(2, 1.85),
  // Tier 3
  hauntedMine: strength(3, 2.67),
  fungalGrotto: strength(3, 2.35),
  stormRidge: strength(3, 2.15),
  cinderHollow: strength(3, 2.23),
  dwarfhold: strength(3, 2.11),
  witchMarsh: strength(3, 2.15),
  drownedCrypt: strength(3, 1.68),
  // Tier 4
  harpyCliffs: strength(4, 2.81),
  thunderPlateau: strength(4, 2.09),
  boneField: strength(4, 2.44),
  orcWarcamp: strength(4, 2.15),
  clockworkVault: strength(4, 2.23),
  frozenLake: strength(4, 1.94),
  giantsHall: strength(4, 1.59),
  // Tier 5
  wyvernPeaks: strength(5, 2.44),
  ossuary: strength(5, 2.19),
  stormIsle: strength(5, 1.86),
  ashenCitadel: strength(5, 1.76),
  abyssalDepths: strength(5, 1.69),
  titanRuins: strength(5, 1.74),
  dragonLair: strength(5, 1.37),
  // Overnight quests: a long, safe patrol at low strength (see overnightQuestRules).
  nightWatch1: strength(1, 1.7),
  nightWatch2: strength(2, 2.5),
  nightWatch3: strength(3, 2.3),
  nightWatch4: strength(4, 2.35),
  nightWatch5: strength(5, 2.05),
};

export const mobs: MobDef[] = [
  // Tier 1
  mob('giantRat', 'giant rat', S.ratCellar, 8, 3, ['beast'], undefined, 'fast'),
  mob('cellarSpider', 'cellar spider', S.ratCellar, 12, 4, ['beast']),
  mob('ratSwarm', 'rat swarm', S.ratCellar, 18, 5, ['beast'], undefined, 'slow'),
  mob('webling', 'webling', S.spiderBurrow, 8, 3, ['beast'], undefined, 'fast'),
  mob('burrowSpider', 'burrow spider', S.spiderBurrow, 12, 4, ['beast']),
  mob('broodGuard', 'brood guard', S.spiderBurrow, 18, 5, ['beast']),
  mob('restlessBones', 'restless bones', S.oldGraveyard, 8, 3, ['undead']),
  mob('graveRobber', 'grave robber', S.oldGraveyard, 12, 4),
  mob('ghoul', 'ghoul', S.oldGraveyard, 18, 5, ['undead']),
  mob('goblinRunt', 'goblin runt', S.goblinWarren, 8, 3, [], undefined, 'fast'),
  mob('goblin', 'goblin', S.goblinWarren, 14, 4),
  mob('goblinSlinger', 'goblin slinger', S.goblinWarren, 14, 5),
  mob('millRat', 'mill rat', S.millRuins, 8, 3, ['beast'], undefined, 'fast'),
  mob('squatter', 'squatter', S.millRuins, 14, 4),
  mob('millBrute', 'mill brute', S.millRuins, 16, 5, [], undefined, 'slow'),
  mob('cutpurse', 'cutpurse', S.smugglersCove, 8, 3, [], undefined, 'fast'),
  mob('smuggler', 'smuggler', S.smugglersCove, 14, 4),
  mob('coveEnforcer', 'cove enforcer', S.smugglersCove, 16, 5),
  mob('guardDog', 'guard dog', S.banditStockade, 10, 4, ['beast'], undefined, 'fast'),
  mob('bandit', 'bandit', S.banditStockade, 16, 5),
  mob('banditArcher', 'bandit archer', S.banditStockade, 16, 6),
  // Tier 2
  mob('wolfPup', 'wolf pup', S.wolfDen, 8, 3, ['beast'], undefined, 'fast'),
  mob('greyWolf', 'grey wolf', S.wolfDen, 14, 4, ['beast'], undefined, 'fast'),
  mob('direWolf', 'dire wolf', S.wolfDen, 20, 5, ['beast'], undefined, 'fast'),
  mob('barrowRat', 'barrow rat', S.barrowMounds, 8, 3, ['beast'], undefined, 'fast'),
  mob('barrowWight', 'barrow wight', S.barrowMounds, 14, 4, ['undead'], undefined, 'normal', 'magic'),
  mob('mouldKnight', 'mould knight', S.barrowMounds, 20, 5, ['undead'], undefined, 'slow'),
  mob('thornPiglet', 'thorn piglet', S.boarThicket, 8, 3, ['beast'], 'grass'),
  mob('wildBoar', 'wild boar', S.boarThicket, 14, 4, ['beast'], 'grass', 'slow'),
  mob('briarTusker', 'briar tusker', S.boarThicket, 20, 5, ['beast'], 'grass', 'slow'),
  mob('bogHound', 'bog hound', S.trollBridge, 10, 4, ['beast'], undefined, 'fast'),
  mob('highwayBandit', 'bandit', S.trollBridge, 16, 5),
  mob('riverTroll', 'river troll', S.trollBridge, 24, 6, [], undefined, 'slow'),
  mob('fordLeech', 'ford leech', S.sunkenFord, 8, 3, ['beast'], 'water', 'slow'),
  mob('riverSprite', 'river sprite', S.sunkenFord, 14, 4, [], 'water'),
  mob('drownedSoldier', 'drowned soldier', S.sunkenFord, 20, 5, ['undead'], 'water'),
  mob('towerCrow', 'tower crow', S.watchtower, 8, 3, ['beast'], undefined, 'fast'),
  mob('deserter', 'deserter', S.watchtower, 16, 5),
  mob('towerSergeant', 'tower sergeant', S.watchtower, 22, 6),
  mob('ogreBrute', 'ogre brute', S.ogreQuarry, 12, 4),
  mob('rockGolem', 'rock golem', S.ogreQuarry, 20, 5),
  mob('quarryOgre', 'quarry ogre', S.ogreQuarry, 24, 6),
  // Tier 3
  mob('ghostBat', 'ghost bat', S.hauntedMine, 8, 3, ['beast', 'undead'], undefined, 'fast'),
  mob('skeletonMiner', 'skeleton miner', S.hauntedMine, 14, 4, ['undead']),
  mob('mineGhost', 'mine ghost', S.hauntedMine, 20, 5, ['undead'], undefined, 'normal', 'magic'),
  mob('sporeling', 'sporeling', S.fungalGrotto, 8, 3, ['beast'], 'grass', 'fast'),
  mob('capCrawler', 'cap crawler', S.fungalGrotto, 14, 4, ['beast'], 'grass'),
  mob('mycelTroll', 'mycel troll', S.fungalGrotto, 22, 5, [], 'grass', 'slow'),
  mob('sparkMoth', 'spark moth', S.stormRidge, 8, 3, ['beast'], 'electric', 'fast'),
  mob('stormHawk', 'storm hawk', S.stormRidge, 14, 4, ['beast'], 'electric', 'fast'),
  mob('boltElemental', 'bolt elemental', S.stormRidge, 20, 5, [], 'electric'),
  mob('fireImp', 'fire imp', S.cinderHollow, 8, 3, [], 'fire', 'fast'),
  mob('magmaSlug', 'magma slug', S.cinderHollow, 16, 4, ['beast'], 'fire', 'slow'),
  mob('emberHound', 'ember hound', S.cinderHollow, 18, 5, ['beast'], 'fire', 'fast'),
  mob('tunnelBeetle', 'tunnel beetle', S.dwarfhold, 10, 3, ['beast']),
  mob('stoneWarden', 'stone warden', S.dwarfhold, 16, 4, [], 'stone', 'slow'),
  mob('runeGolem', 'rune golem', S.dwarfhold, 24, 5, [], 'stone', 'slow'),
  mob('marshToad', 'marsh toad', S.witchMarsh, 8, 3, ['beast'], 'grass'),
  mob('bogling', 'bogling', S.witchMarsh, 14, 4, [], 'grass'),
  mob('hexedHunter', 'hexed hunter', S.witchMarsh, 18, 5),
  mob('cryptEel', 'crypt eel', S.drownedCrypt, 10, 4, ['beast']),
  mob('drownedDead', 'drowned dead', S.drownedCrypt, 16, 5, ['undead']),
  mob('boneKnight', 'bone knight', S.drownedCrypt, 22, 6, ['undead']),
  // Tier 4
  mob('rockLizard', 'rock lizard', S.harpyCliffs, 8, 3, ['beast'], undefined, 'fast'),
  mob('cliffEagle', 'cliff eagle', S.harpyCliffs, 12, 4, ['beast'], undefined, 'fast'),
  mob('harpy', 'harpy', S.harpyCliffs, 18, 5, ['beast'], undefined, 'fast'),
  mob('stormRam', 'storm ram', S.thunderPlateau, 10, 3, ['beast'], 'electric'),
  mob('thunderbird', 'thunderbird', S.thunderPlateau, 14, 4, ['beast'], 'electric', 'fast'),
  mob('skyfallGolem', 'skyfall golem', S.thunderPlateau, 22, 5, [], 'electric', 'slow'),
  mob('boneCrawler', 'bone crawler', S.boneField, 8, 3, ['undead']),
  mob('fallenLegionary', 'fallen legionary', S.boneField, 16, 5, ['undead']),
  mob('deathCaptain', 'death captain', S.boneField, 22, 6, ['undead']),
  mob('orcGrunt', 'orc grunt', S.orcWarcamp, 12, 4),
  mob('orcRaider', 'orc raider', S.orcWarcamp, 16, 5),
  mob('orcShaman', 'orc shaman', S.orcWarcamp, 16, 6, [], undefined, 'normal', 'magic'),
  mob('brassBeetle', 'brass beetle', S.clockworkVault, 10, 3),
  mob('clockworkGuard', 'clockwork guard', S.clockworkVault, 16, 5),
  mob('vaultAutomaton', 'vault automaton', S.clockworkVault, 24, 6, [], undefined, 'slow'),
  mob('iceSeal', 'ice seal', S.frozenLake, 10, 3, ['beast'], 'water', 'slow'),
  mob('frostNymph', 'frost nymph', S.frozenLake, 14, 4, [], 'water'),
  mob('lakeSerpent', 'lake serpent', S.frozenLake, 22, 6, ['beast'], 'water'),
  mob('giantHound', 'giant hound', S.giantsHall, 12, 4, ['beast'], undefined, 'fast'),
  mob('stoneSentinel', 'stone sentinel', S.giantsHall, 20, 5, [], undefined, 'slow'),
  mob('hillGiant', 'hill giant', S.giantsHall, 26, 7, [], undefined, 'slow'),
  // Tier 5
  mob('frostWolf', 'frost wolf', S.wyvernPeaks, 10, 4, ['beast'], undefined, 'fast'),
  mob('mountainTroll', 'mountain troll', S.wyvernPeaks, 20, 5, [], undefined, 'slow'),
  mob('wyvern', 'wyvern', S.wyvernPeaks, 22, 6, ['beast'], undefined, 'fast'),
  mob('cryptGuard', 'crypt guard', S.ossuary, 10, 4, ['undead']),
  mob('boneLord', 'bone lord', S.ossuary, 18, 5, ['undead']),
  mob('deathKnight', 'death knight', S.ossuary, 24, 6, ['undead'], undefined, 'slow'),
  mob('stormEel', 'storm eel', S.stormIsle, 10, 4, ['beast'], 'electric', 'fast'),
  mob('tempestCaller', 'tempest caller', S.stormIsle, 18, 5, [], 'electric'),
  mob('thunderDrake', 'thunder drake', S.stormIsle, 22, 6, ['beast'], 'electric', 'fast'),
  mob('flameCultist', 'flame cultist', S.ashenCitadel, 10, 4, [], 'fire'),
  mob('cinderGolem', 'cinder golem', S.ashenCitadel, 20, 5, [], 'fire', 'slow'),
  mob('ashKnight', 'ash knight', S.ashenCitadel, 22, 6, ['undead'], 'fire'),
  mob('deepAngler', 'deep angler', S.abyssalDepths, 10, 4, ['beast'], 'water'),
  mob('abyssalPriest', 'abyssal priest', S.abyssalDepths, 18, 5, [], 'water'),
  mob('krakenSpawn', 'kraken spawn', S.abyssalDepths, 24, 6, ['beast'], 'water', 'slow'),
  mob('ruinCrawler', 'ruin crawler', S.titanRuins, 10, 4, ['beast']),
  mob('titanShard', 'titan shard', S.titanRuins, 18, 5, [], 'stone', 'slow'),
  mob('colossusArm', 'colossus arm', S.titanRuins, 24, 6, [], 'stone', 'slow'),
  mob('dragonCultist', 'dragon cultist', S.dragonLair, 12, 4, [], 'fire'),
  mob('drake', 'drake', S.dragonLair, 20, 6, ['beast'], 'fire', 'fast'),
  mob('fireElemental', 'fire elemental', S.dragonLair, 22, 6, [], 'fire'),
];

export const bosses: BossDef[] = [
  boss('ratKing', 'rat king', S.ratCellar, 45, 6, ['beast']),
  boss('broodMother', 'brood mother', S.spiderBurrow, 45, 6, ['beast'], undefined, undefined, 'slow'),
  boss('graveLord', 'grave lord', S.oldGraveyard, 45, 6, ['undead'], undefined, undefined, 'normal', 'magic'),
  boss('goblinChief', 'goblin chief', S.goblinWarren, 60, 7),
  boss('millOgre', 'mill ogre', S.millRuins, 60, 7, [], undefined, undefined, 'slow'),
  boss('smugglerQueen', 'smuggler queen', S.smugglersCove, 60, 7),
  boss('banditCaptain', 'bandit captain', S.banditStockade, 110, 9, [], 'enrage'),
  boss('alphaWolf', 'alpha wolf', S.wolfDen, 55, 7, ['beast'], undefined, undefined, 'fast'),
  boss('barrowKing', 'barrow king', S.barrowMounds, 55, 7, ['undead']),
  boss('thicketBoar', 'great thicket boar', S.boarThicket, 55, 7, ['beast'], undefined, 'grass', 'slow'),
  boss('bridgeTroll', 'bridge troll', S.trollBridge, 70, 8, [], undefined, undefined, 'slow'),
  boss('fordHag', 'ford hag', S.sunkenFord, 70, 8, [], undefined, 'water'),
  boss('turncoatKnight', 'turncoat knight', S.watchtower, 70, 8),
  boss('ogreChieftain', 'ogre chieftain', S.ogreQuarry, 120, 10, [], 'sweep', undefined, 'slow'),
  boss('mineWraith', 'mine wraith', S.hauntedMine, 55, 7, ['undead'], undefined, undefined, 'normal', 'magic'),
  boss('sporeQueen', 'spore queen', S.fungalGrotto, 55, 7, [], undefined, 'grass'),
  boss('stormRoc', 'storm roc', S.stormRidge, 55, 7, ['beast'], undefined, 'electric', 'fast'),
  boss('ashWyrm', 'ash wyrm', S.cinderHollow, 70, 8, ['beast'], undefined, 'fire'),
  boss('forgeGuardian', 'forge guardian', S.dwarfhold, 70, 8, [], undefined, 'stone', 'slow'),
  boss('marshWitch', 'marsh witch', S.witchMarsh, 70, 8, [], 'enrage', 'grass'),
  boss('lichOfTheDeep', 'lich of the deep', S.drownedCrypt, 125, 10, ['undead'], 'enrage', undefined, 'normal', 'magic'),
  boss('harpyMatriarch', 'harpy matriarch', S.harpyCliffs, 55, 7, ['beast'], 'sweep', undefined, 'fast'),
  boss('thunderTitan', 'thunder titan', S.thunderPlateau, 55, 7, [], 'sweep', 'electric', 'slow'),
  boss('boneGeneral', 'bone general', S.boneField, 55, 7, ['undead'], 'enrage'),
  boss('orcWarlord', 'orc warlord', S.orcWarcamp, 75, 8, [], 'enrage'),
  boss('clockworkWarden', 'clockwork warden', S.clockworkVault, 75, 8, [], 'sweep', undefined, 'slow'),
  boss('iceWyrm', 'ice wyrm', S.frozenLake, 75, 8, ['beast'], undefined, 'water'),
  boss('giantKing', 'giant king', S.giantsHall, 130, 11, [], 'sweep', undefined, 'slow'),
  boss('wyvernQueen', 'wyvern queen', S.wyvernPeaks, 60, 8, ['beast'], 'sweep', undefined, 'fast'),
  boss('ossuaryKing', 'ossuary king', S.ossuary, 60, 8, ['undead'], 'enrage'),
  boss('stormcaller', 'stormcaller', S.stormIsle, 60, 8, [], 'sweep', 'electric'),
  boss('ashLord', 'ash lord', S.ashenCitadel, 80, 9, [], 'enrage', 'fire'),
  boss('abyssalHorror', 'abyssal horror', S.abyssalDepths, 80, 9, ['beast'], 'sweep', 'water', 'slow'),
  boss('titanHeart', 'titan heart', S.titanRuins, 80, 9, [], 'enrage', 'stone', 'slow'),
  boss('elderDragon', 'elder dragon', S.dragonLair, 140, 12, ['beast'], 'sweep', 'fire'),
  // The overnight quests' patrol leaders: the run's only real threat.
  boss('nightProwler', 'night prowler', S.nightWatch1, 120, 20, ['beast'], undefined, undefined, 'fast'),
  boss('roadStalker', 'road stalker', S.nightWatch2, 65, 12, ['beast'], undefined, undefined, 'fast'),
  boss('shaftHaunt', 'shaft haunt', S.nightWatch3, 65, 12, ['undead'], undefined, undefined, 'normal', 'magic'),
  boss('campRaider', 'camp raider', S.nightWatch4, 65, 12),
  boss('ashStalker', 'ash stalker', S.nightWatch5, 65, 12, [], undefined, 'fire', 'fast'),
];

/** The mob an NPC turns into when the party fights them, at a dungeon tier. */
export const npcMobId = (npcId: string, tier: number) => `npc:${npcId}:${tier}`;

/** NPCs fight at roughly a tier's short-dungeon strength. */
const NPC_STRENGTH = 1.6;

const npcMobs: MobDef[] = npcs.flatMap((npc) =>
  TIER_SCALE.map((_, i) =>
    mob(npcMobId(npc.id, i + 1), npc.hostile.name, strength(i + 1, NPC_STRENGTH), npc.hostile.hp, npc.hostile.damage, [
      'locals',
    ]),
  ),
);

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

type PatrolTemplate = {
  /** Stats for [weak, normal, boss] at tier-1 strength. */
  hp: [number, number, number];
  damage: [number, number, number];
  tags: Tag[];
  /** Like a dungeon's factor, per tier: tuned against the odds targets in the comment above. */
  factors: [number, number, number, number, number];
  /** Names for [weak, normal, boss], one per tier. */
  names: string[][];
};

const patrolTemplates: Record<PatrolKind, PatrolTemplate> = {
  goblins: {
    hp: [7, 10, 14],
    damage: [2, 3, 4],
    tags: ['locals'],
    factors: [3.03, 2.75, 2.57, 2.58, 2.69],
    names: [
      ['goblin runt', 'goblin', 'goblin slinger'],
      ['squatter', 'smuggler', 'turncoat knight'],
      ['fire imp', 'hexed hunter', 'stone warden'],
      ['orc grunt', 'brass beetle', 'vault automaton'],
      ['ruin crawler', 'mountain troll', 'ash knight'],
    ],
  },
  herd: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: ['beast'],
    factors: [2.81, 2.46, 2.33, 2.41, 2.39],
    names: [
      ['giant rat', 'cellar spider', 'rat swarm'],
      ['wolf pup', 'grey wolf', 'dire wolf'],
      ['ghost bat', 'spark moth', 'ember hound'],
      ['rock lizard', 'storm ram', 'thunderbird'],
      ['frost wolf', 'storm eel', 'wyvern'],
    ],
  },
  bandits: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['locals'],
    factors: [4.88, 4.36, 4.16, 4.1, 4.29],
    names: [
      ['cutpurse', 'bandit', 'bandit archer'],
      ['deserter', 'bandit', 'tower sergeant'],
      ['bogling', 'hexed hunter', 'bone knight'],
      ['fallen legionary', 'orc raider', 'death captain'],
      ['flame cultist', 'abyssal priest', 'death knight'],
    ],
  },
};

/** A patrol mob, or its elite variant, by kind, tier and role. */
export const patrolMobId = (kind: PatrolKind, tier: number, role: PatrolRole, elite = false) =>
  `patrol:${kind}:${tier}:${role}${elite ? ':elite' : ''}`;

const patrolMobs: MobDef[] = (Object.keys(patrolTemplates) as PatrolKind[]).flatMap((kind) => {
  const { hp, damage, tags, factors, names } = patrolTemplates[kind];
  // Herds charge; goblins and bandits keep pace with heroes.
  const speedClass: SpeedClass = kind === 'herd' ? 'fast' : 'normal';
  return names.flatMap((tierNames, i) =>
    tierNames.flatMap((name, role) => [
      mob(patrolMobId(kind, i + 1, PATROL_ROLES[role]), name, strength(i + 1, factors[i]), hp[role], damage[role], tags, undefined, speedClass),
      mob(
        patrolMobId(kind, i + 1, PATROL_ROLES[role], true),
        name,
        strength(i + 1, factors[i]),
        hp[role] * PATROL_ELITE.hp,
        damage[role] * PATROL_ELITE.damage,
        tags,
        undefined,
        speedClass,
      ),
    ]),
  );
});

// Fight events and the monster lair: the fixed enemies home heroes fight at
// map places (see content/placeFights.ts). Templates work like patrol ones;
// the factors are the bandit and goblin/herd patrol factors, since place
// fights are tuned like patrols with a full party.
type PlaceTemplate = {
  /** Stats for [weak, normal, boss] at tier-1 strength. */
  hp: [number, number, number];
  damage: [number, number, number];
  tags: Tag[];
  factors: [number, number, number, number, number];
  /** Names for [weak, normal, boss], one row per tier. */
  names: string[][];
  /** One mob set per element instead of a single set. */
  elemental?: boolean;
};

const BANDIT_FACTORS: [number, number, number, number, number] = [4.88, 4.36, 4.16, 4.1, 4.29];
const GOBLIN_FACTORS: [number, number, number, number, number] = [3.03, 2.75, 2.57, 2.58, 2.69];
const HERD_FACTORS: [number, number, number, number, number] = [2.81, 2.46, 2.33, 2.41, 2.39];

const placeTemplates: Record<FightPlaceKind, PlaceTemplate> = {
  banditCamp: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['locals'],
    factors: BANDIT_FACTORS,
    names: [
      ['cutpurse', 'bandit', 'bandit archer'],
      ['deserter', 'bandit', 'tower sergeant'],
      ['bogling', 'hexed hunter', 'bone knight'],
      ['fallen legionary', 'orc raider', 'death captain'],
      ['flame cultist', 'abyssal priest', 'death knight'],
    ],
  },
  goblinRaid: {
    hp: [7, 10, 14],
    damage: [2, 3, 4],
    tags: ['locals'],
    factors: GOBLIN_FACTORS,
    names: [
      ['goblin runt', 'goblin', 'goblin slinger'],
      ['squatter', 'smuggler', 'turncoat knight'],
      ['fire imp', 'hexed hunter', 'stone warden'],
      ['orc grunt', 'brass beetle', 'vault automaton'],
      ['ruin crawler', 'mountain troll', 'ash knight'],
    ],
  },
  beastDen: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: ['beast'],
    factors: HERD_FACTORS,
    names: [
      ['giant rat', 'cellar spider', 'rat swarm'],
      ['wolf pup', 'grey wolf', 'dire wolf'],
      ['ghost bat', 'spark moth', 'ember hound'],
      ['rock lizard', 'storm ram', 'thunderbird'],
      ['frost wolf', 'storm eel', 'wyvern'],
    ],
  },
  hauntedCrypt: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: ['undead'],
    factors: HERD_FACTORS,
    names: [
      ['restless bones', 'grave robber', 'ghoul'],
      ['barrow wight', 'drowned soldier', 'mould knight'],
      ['skeleton miner', 'drowned dead', 'bone knight'],
      ['bone crawler', 'fallen legionary', 'death captain'],
      ['crypt guard', 'bone lord', 'death knight'],
    ],
  },
  elementalRift: {
    hp: [8, 12, 16],
    damage: [2, 3, 4],
    tags: [],
    factors: HERD_FACTORS,
    elemental: true,
    names: [
      ['ember whelp', 'ember sprite', 'rift spawn'],
      ['mud mephit', 'mud brute', 'rift horror'],
      ['spark imp', 'spark elemental', 'rift caller'],
      ['gale wisp', 'gale elemental', 'rift warden'],
      ['void whelp', 'void elemental', 'rift tyrant'],
    ],
  },
  abandonedCaravan: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['locals'],
    factors: BANDIT_FACTORS,
    names: [
      ['cutpurse', 'bandit', 'bandit archer'],
      ['deserter', 'bandit', 'tower sergeant'],
      ['bogling', 'hexed hunter', 'bone knight'],
      ['fallen legionary', 'orc raider', 'death captain'],
      ['flame cultist', 'abyssal priest', 'death knight'],
    ],
  },
  wantedOutlaw: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['locals'],
    factors: BANDIT_FACTORS,
    names: [
      ['cutpurse', 'bandit', 'bandit archer'],
      ['deserter', 'bandit', 'tower sergeant'],
      ['bogling', 'hexed hunter', 'bone knight'],
      ['fallen legionary', 'orc raider', 'death captain'],
      ['flame cultist', 'abyssal priest', 'death knight'],
    ],
  },
  monsterLair: {
    hp: [10, 14, 22],
    damage: [3, 4, 6],
    tags: ['beast'],
    factors: BANDIT_FACTORS,
    names: [
      ['giant rat', 'ghoul', 'rat king'],
      ['bog hound', 'river troll', 'barrow king'],
      ['ember hound', 'mycel troll', 'ash wyrm'],
      ['giant hound', 'hill giant', 'harpy matriarch'],
      ['frost wolf', 'mountain troll', 'wyvern queen'],
    ],
  },
};

/** A place fight mob, or its elite variant, by kind, tier, role and element. */
export const placeMobId = (kind: FightPlaceKind, tier: number, role: 'weak' | 'normal' | 'boss', elite = false, element?: Element) =>
  `place:${kind}:${tier}:${role}${elite ? ':elite' : ''}${element ? `:${element}` : ''}`;

const placeMobs: MobDef[] = (Object.keys(placeTemplates) as FightPlaceKind[]).flatMap((kind) => {
  const { hp, damage, tags, factors, names, elemental } = placeTemplates[kind];
  // Beasts charge; everyone else keeps pace with heroes.
  const speedClass: SpeedClass = tags.includes('beast') ? 'fast' : 'normal';
  const elements = elemental ? [...ELEMENTS] : [undefined];
  return names.flatMap((tierNames, i) =>
    tierNames.flatMap((name, role) =>
      elements.flatMap((element) => [
        mob(
          placeMobId(kind, i + 1, PATROL_ROLES[role], false, element),
          name,
          strength(i + 1, factors[i]),
          hp[role],
          damage[role],
          tags,
          element,
          speedClass,
        ),
        mob(
          placeMobId(kind, i + 1, PATROL_ROLES[role], true, element),
          name,
          strength(i + 1, factors[i]),
          hp[role] * PATROL_ELITE.hp,
          damage[role] * PATROL_ELITE.damage,
          tags,
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
      return mob(sanctumMinionId(sanctum.id, which, i + 1), sanctum.minions[j], sanctumScale(i + 1), hp, damage, [], sanctum.element);
    }),
  ),
);

/** A Sanctum's guardian at a Sigil tier. */
export function sanctumGuardian(sanctum: SanctumDef, tier: number): BossDef {
  const { hp, damage } = sanctumRules.guardianBase;
  return boss(`${sanctum.id}:guardian:${tier}`, sanctum.guardian.name, sanctumScale(tier), hp, damage, [], sanctum.guardian.effect, sanctum.element);
}

export const mobById = Object.fromEntries([...mobs, ...npcMobs, ...sanctumMinions, ...patrolMobs, ...placeMobs].map((m) => [m.id, m]));
export const bossById = Object.fromEntries(bosses.map((b) => [b.id, b]));
