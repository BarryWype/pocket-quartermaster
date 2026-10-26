import type { Element } from '@/game/elements';
import type { BossDef, MobDef, SanctumDef, Tag } from '@/game/types';

import { npcs } from './npcs';
import { sanctumRules, sanctums } from './sanctums';

// Enemies are written at tier 1 strength, then scaled by their tier and by how
// tough their dungeon should be within it. Per-dungeon strengths are tuned so
// that, with the tier's full kit at the expected level, short dungeons succeed
// well over 65% of the time, long ones over 45% and bosses 30–60% (see
// src/game/balance/balance.test.ts).
const TIER_SCALE = [1, 1.9, 3, 4.2, 5.6];

const strength = (tier: number, dungeonFactor: number) => TIER_SCALE[tier - 1] * dungeonFactor;

function mob(id: string, name: string, scale: number, hp: number, damage: number, tags: Tag[] = [], element?: Element): MobDef {
  return { id, name, hp: Math.round(hp * scale), damage: Math.round(damage * scale), element, tags };
}

function boss(
  id: string,
  name: string,
  scale: number,
  hp: number,
  damage: number,
  tags: Tag[] = [],
  effect?: BossDef['effect'],
  element?: Element,
): BossDef {
  return { ...mob(id, name, scale, hp, damage, tags, element), effect };
}

/** A mob's tags, with its element as a tag too. */
export const mobTags = (mob: MobDef): Tag[] => (mob.element ? [...mob.tags, mob.element] : mob.tags);

const S = {
  // Tier 1
  ratCellar: strength(1, 1.58),
  spiderBurrow: strength(1, 1.68),
  oldGraveyard: strength(1, 1.34),
  goblinWarren: strength(1, 3.71),
  millRuins: strength(1, 3.79),
  smugglersCove: strength(1, 3.87),
  banditStockade: strength(1, 2.53),
  // Tier 2
  wolfDen: strength(2, 3.31),
  barrowMounds: strength(2, 2.70),
  boarThicket: strength(2, 2.93),
  trollBridge: strength(2, 3.05),
  sunkenFord: strength(2, 2.31),
  watchtower: strength(2, 2.97),
  ogreQuarry: strength(2, 2.04),
  // Tier 3
  hauntedMine: strength(3, 2.93),
  fungalGrotto: strength(3, 2.56),
  stormRidge: strength(3, 2.44),
  cinderHollow: strength(3, 2.40),
  dwarfhold: strength(3, 2.28),
  witchMarsh: strength(3, 2.34),
  drownedCrypt: strength(3, 1.92),
  // Tier 4
  harpyCliffs: strength(4, 3.18),
  thunderPlateau: strength(4, 2.37),
  boneField: strength(4, 2.64),
  orcWarcamp: strength(4, 2.32),
  clockworkVault: strength(4, 2.50),
  frozenLake: strength(4, 2.08),
  giantsHall: strength(4, 1.88),
  // Tier 5
  wyvernPeaks: strength(5, 2.68),
  ossuary: strength(5, 2.36),
  stormIsle: strength(5, 2.08),
  ashenCitadel: strength(5, 1.86),
  abyssalDepths: strength(5, 1.85),
  titanRuins: strength(5, 1.91),
  dragonLair: strength(5, 1.56),
};

export const mobs: MobDef[] = [
  // Tier 1
  mob('giantRat', 'giant rat', S.ratCellar, 8, 3, ['beast']),
  mob('cellarSpider', 'cellar spider', S.ratCellar, 12, 4, ['beast']),
  mob('ratSwarm', 'rat swarm', S.ratCellar, 18, 5, ['beast']),
  mob('webling', 'webling', S.spiderBurrow, 8, 3, ['beast']),
  mob('burrowSpider', 'burrow spider', S.spiderBurrow, 12, 4, ['beast']),
  mob('broodGuard', 'brood guard', S.spiderBurrow, 18, 5, ['beast']),
  mob('restlessBones', 'restless bones', S.oldGraveyard, 8, 3, ['undead']),
  mob('graveRobber', 'grave robber', S.oldGraveyard, 12, 4),
  mob('ghoul', 'ghoul', S.oldGraveyard, 18, 5, ['undead']),
  mob('goblinRunt', 'goblin runt', S.goblinWarren, 8, 3),
  mob('goblin', 'goblin', S.goblinWarren, 14, 4),
  mob('goblinSlinger', 'goblin slinger', S.goblinWarren, 14, 5),
  mob('millRat', 'mill rat', S.millRuins, 8, 3, ['beast']),
  mob('squatter', 'squatter', S.millRuins, 14, 4),
  mob('millBrute', 'mill brute', S.millRuins, 16, 5),
  mob('cutpurse', 'cutpurse', S.smugglersCove, 8, 3),
  mob('smuggler', 'smuggler', S.smugglersCove, 14, 4),
  mob('coveEnforcer', 'cove enforcer', S.smugglersCove, 16, 5),
  mob('guardDog', 'guard dog', S.banditStockade, 10, 4, ['beast']),
  mob('bandit', 'bandit', S.banditStockade, 16, 5),
  mob('banditArcher', 'bandit archer', S.banditStockade, 16, 6),
  // Tier 2
  mob('wolfPup', 'wolf pup', S.wolfDen, 8, 3, ['beast']),
  mob('greyWolf', 'grey wolf', S.wolfDen, 14, 4, ['beast']),
  mob('direWolf', 'dire wolf', S.wolfDen, 20, 5, ['beast']),
  mob('barrowRat', 'barrow rat', S.barrowMounds, 8, 3, ['beast']),
  mob('barrowWight', 'barrow wight', S.barrowMounds, 14, 4, ['undead']),
  mob('mouldKnight', 'mould knight', S.barrowMounds, 20, 5, ['undead']),
  mob('thornPiglet', 'thorn piglet', S.boarThicket, 8, 3, ['beast'], 'grass'),
  mob('wildBoar', 'wild boar', S.boarThicket, 14, 4, ['beast'], 'grass'),
  mob('briarTusker', 'briar tusker', S.boarThicket, 20, 5, ['beast'], 'grass'),
  mob('bogHound', 'bog hound', S.trollBridge, 10, 4, ['beast']),
  mob('highwayBandit', 'bandit', S.trollBridge, 16, 5),
  mob('riverTroll', 'river troll', S.trollBridge, 24, 6),
  mob('fordLeech', 'ford leech', S.sunkenFord, 8, 3, ['beast'], 'water'),
  mob('riverSprite', 'river sprite', S.sunkenFord, 14, 4, [], 'water'),
  mob('drownedSoldier', 'drowned soldier', S.sunkenFord, 20, 5, ['undead'], 'water'),
  mob('towerCrow', 'tower crow', S.watchtower, 8, 3, ['beast']),
  mob('deserter', 'deserter', S.watchtower, 16, 5),
  mob('towerSergeant', 'tower sergeant', S.watchtower, 22, 6),
  mob('ogreBrute', 'ogre brute', S.ogreQuarry, 12, 4),
  mob('rockGolem', 'rock golem', S.ogreQuarry, 20, 5),
  mob('quarryOgre', 'quarry ogre', S.ogreQuarry, 24, 6),
  // Tier 3
  mob('ghostBat', 'ghost bat', S.hauntedMine, 8, 3, ['beast', 'undead']),
  mob('skeletonMiner', 'skeleton miner', S.hauntedMine, 14, 4, ['undead']),
  mob('mineGhost', 'mine ghost', S.hauntedMine, 20, 5, ['undead']),
  mob('sporeling', 'sporeling', S.fungalGrotto, 8, 3, ['beast'], 'grass'),
  mob('capCrawler', 'cap crawler', S.fungalGrotto, 14, 4, ['beast'], 'grass'),
  mob('mycelTroll', 'mycel troll', S.fungalGrotto, 22, 5, [], 'grass'),
  mob('sparkMoth', 'spark moth', S.stormRidge, 8, 3, ['beast'], 'electric'),
  mob('stormHawk', 'storm hawk', S.stormRidge, 14, 4, ['beast'], 'electric'),
  mob('boltElemental', 'bolt elemental', S.stormRidge, 20, 5, [], 'electric'),
  mob('fireImp', 'fire imp', S.cinderHollow, 8, 3, [], 'fire'),
  mob('magmaSlug', 'magma slug', S.cinderHollow, 16, 4, ['beast'], 'fire'),
  mob('emberHound', 'ember hound', S.cinderHollow, 18, 5, ['beast'], 'fire'),
  mob('tunnelBeetle', 'tunnel beetle', S.dwarfhold, 10, 3, ['beast']),
  mob('stoneWarden', 'stone warden', S.dwarfhold, 16, 4, [], 'stone'),
  mob('runeGolem', 'rune golem', S.dwarfhold, 24, 5, [], 'stone'),
  mob('marshToad', 'marsh toad', S.witchMarsh, 8, 3, ['beast'], 'grass'),
  mob('bogling', 'bogling', S.witchMarsh, 14, 4, [], 'grass'),
  mob('hexedHunter', 'hexed hunter', S.witchMarsh, 18, 5),
  mob('cryptEel', 'crypt eel', S.drownedCrypt, 10, 4, ['beast']),
  mob('drownedDead', 'drowned dead', S.drownedCrypt, 16, 5, ['undead']),
  mob('boneKnight', 'bone knight', S.drownedCrypt, 22, 6, ['undead']),
  // Tier 4
  mob('rockLizard', 'rock lizard', S.harpyCliffs, 8, 3, ['beast']),
  mob('cliffEagle', 'cliff eagle', S.harpyCliffs, 12, 4, ['beast']),
  mob('harpy', 'harpy', S.harpyCliffs, 18, 5, ['beast']),
  mob('stormRam', 'storm ram', S.thunderPlateau, 10, 3, ['beast'], 'electric'),
  mob('thunderbird', 'thunderbird', S.thunderPlateau, 14, 4, ['beast'], 'electric'),
  mob('skyfallGolem', 'skyfall golem', S.thunderPlateau, 22, 5, [], 'electric'),
  mob('boneCrawler', 'bone crawler', S.boneField, 8, 3, ['undead']),
  mob('fallenLegionary', 'fallen legionary', S.boneField, 16, 5, ['undead']),
  mob('deathCaptain', 'death captain', S.boneField, 22, 6, ['undead']),
  mob('orcGrunt', 'orc grunt', S.orcWarcamp, 12, 4),
  mob('orcRaider', 'orc raider', S.orcWarcamp, 16, 5),
  mob('orcShaman', 'orc shaman', S.orcWarcamp, 16, 6),
  mob('brassBeetle', 'brass beetle', S.clockworkVault, 10, 3),
  mob('clockworkGuard', 'clockwork guard', S.clockworkVault, 16, 5),
  mob('vaultAutomaton', 'vault automaton', S.clockworkVault, 24, 6),
  mob('iceSeal', 'ice seal', S.frozenLake, 10, 3, ['beast'], 'water'),
  mob('frostNymph', 'frost nymph', S.frozenLake, 14, 4, [], 'water'),
  mob('lakeSerpent', 'lake serpent', S.frozenLake, 22, 6, ['beast'], 'water'),
  mob('giantHound', 'giant hound', S.giantsHall, 12, 4, ['beast']),
  mob('stoneSentinel', 'stone sentinel', S.giantsHall, 20, 5),
  mob('hillGiant', 'hill giant', S.giantsHall, 26, 7),
  // Tier 5
  mob('frostWolf', 'frost wolf', S.wyvernPeaks, 10, 4, ['beast']),
  mob('mountainTroll', 'mountain troll', S.wyvernPeaks, 20, 5),
  mob('wyvern', 'wyvern', S.wyvernPeaks, 22, 6, ['beast']),
  mob('cryptGuard', 'crypt guard', S.ossuary, 10, 4, ['undead']),
  mob('boneLord', 'bone lord', S.ossuary, 18, 5, ['undead']),
  mob('deathKnight', 'death knight', S.ossuary, 24, 6, ['undead']),
  mob('stormEel', 'storm eel', S.stormIsle, 10, 4, ['beast'], 'electric'),
  mob('tempestCaller', 'tempest caller', S.stormIsle, 18, 5, [], 'electric'),
  mob('thunderDrake', 'thunder drake', S.stormIsle, 22, 6, ['beast'], 'electric'),
  mob('flameCultist', 'flame cultist', S.ashenCitadel, 10, 4, [], 'fire'),
  mob('cinderGolem', 'cinder golem', S.ashenCitadel, 20, 5, [], 'fire'),
  mob('ashKnight', 'ash knight', S.ashenCitadel, 22, 6, ['undead'], 'fire'),
  mob('deepAngler', 'deep angler', S.abyssalDepths, 10, 4, ['beast'], 'water'),
  mob('abyssalPriest', 'abyssal priest', S.abyssalDepths, 18, 5, [], 'water'),
  mob('krakenSpawn', 'kraken spawn', S.abyssalDepths, 24, 6, ['beast'], 'water'),
  mob('ruinCrawler', 'ruin crawler', S.titanRuins, 10, 4, ['beast']),
  mob('titanShard', 'titan shard', S.titanRuins, 18, 5, [], 'stone'),
  mob('colossusArm', 'colossus arm', S.titanRuins, 24, 6, [], 'stone'),
  mob('dragonCultist', 'dragon cultist', S.dragonLair, 12, 4, [], 'fire'),
  mob('drake', 'drake', S.dragonLair, 20, 6, ['beast'], 'fire'),
  mob('fireElemental', 'fire elemental', S.dragonLair, 22, 6, [], 'fire'),
];

export const bosses: BossDef[] = [
  boss('ratKing', 'rat king', S.ratCellar, 45, 6, ['beast']),
  boss('broodMother', 'brood mother', S.spiderBurrow, 45, 6, ['beast']),
  boss('graveLord', 'grave lord', S.oldGraveyard, 45, 6, ['undead']),
  boss('goblinChief', 'goblin chief', S.goblinWarren, 60, 7),
  boss('millOgre', 'mill ogre', S.millRuins, 60, 7),
  boss('smugglerQueen', 'smuggler queen', S.smugglersCove, 60, 7),
  boss('banditCaptain', 'bandit captain', S.banditStockade, 110, 9, [], 'enrage'),
  boss('alphaWolf', 'alpha wolf', S.wolfDen, 55, 7, ['beast']),
  boss('barrowKing', 'barrow king', S.barrowMounds, 55, 7, ['undead']),
  boss('thicketBoar', 'great thicket boar', S.boarThicket, 55, 7, ['beast'], undefined, 'grass'),
  boss('bridgeTroll', 'bridge troll', S.trollBridge, 70, 8),
  boss('fordHag', 'ford hag', S.sunkenFord, 70, 8, [], undefined, 'water'),
  boss('turncoatKnight', 'turncoat knight', S.watchtower, 70, 8),
  boss('ogreChieftain', 'ogre chieftain', S.ogreQuarry, 120, 10, [], 'sweep'),
  boss('mineWraith', 'mine wraith', S.hauntedMine, 55, 7, ['undead']),
  boss('sporeQueen', 'spore queen', S.fungalGrotto, 55, 7, [], undefined, 'grass'),
  boss('stormRoc', 'storm roc', S.stormRidge, 55, 7, ['beast'], undefined, 'electric'),
  boss('ashWyrm', 'ash wyrm', S.cinderHollow, 70, 8, ['beast'], undefined, 'fire'),
  boss('forgeGuardian', 'forge guardian', S.dwarfhold, 70, 8, [], undefined, 'stone'),
  boss('marshWitch', 'marsh witch', S.witchMarsh, 70, 8, [], 'enrage', 'grass'),
  boss('lichOfTheDeep', 'lich of the deep', S.drownedCrypt, 125, 10, ['undead'], 'enrage'),
  boss('harpyMatriarch', 'harpy matriarch', S.harpyCliffs, 55, 7, ['beast'], 'sweep'),
  boss('thunderTitan', 'thunder titan', S.thunderPlateau, 55, 7, [], 'sweep', 'electric'),
  boss('boneGeneral', 'bone general', S.boneField, 55, 7, ['undead'], 'enrage'),
  boss('orcWarlord', 'orc warlord', S.orcWarcamp, 75, 8, [], 'enrage'),
  boss('clockworkWarden', 'clockwork warden', S.clockworkVault, 75, 8, [], 'sweep'),
  boss('iceWyrm', 'ice wyrm', S.frozenLake, 75, 8, ['beast'], undefined, 'water'),
  boss('giantKing', 'giant king', S.giantsHall, 130, 11, [], 'sweep'),
  boss('wyvernQueen', 'wyvern queen', S.wyvernPeaks, 60, 8, ['beast'], 'sweep'),
  boss('ossuaryKing', 'ossuary king', S.ossuary, 60, 8, ['undead'], 'enrage'),
  boss('stormcaller', 'stormcaller', S.stormIsle, 60, 8, [], 'sweep', 'electric'),
  boss('ashLord', 'ash lord', S.ashenCitadel, 80, 9, [], 'enrage', 'fire'),
  boss('abyssalHorror', 'abyssal horror', S.abyssalDepths, 80, 9, ['beast'], 'sweep', 'water'),
  boss('titanHeart', 'titan heart', S.titanRuins, 80, 9, [], 'enrage', 'stone'),
  boss('elderDragon', 'elder dragon', S.dragonLair, 140, 12, ['beast'], 'sweep', 'fire'),
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

export const mobById = Object.fromEntries([...mobs, ...npcMobs, ...sanctumMinions].map((m) => [m.id, m]));
export const bossById = Object.fromEntries(bosses.map((b) => [b.id, b]));
