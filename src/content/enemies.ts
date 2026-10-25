import type { BossDef, MobDef } from '@/game/types';

// Enemies are written at tier 1 strength, then scaled by their tier and by how
// tough their dungeon should be within it. Per-dungeon strengths are tuned so
// that, with the tier's full kit at the expected level, a tier's dungeons
// succeed about 95% / 70% / 35% of the time, and the Rat Cellar about 75% with
// just a wooden sword (see src/game/balance/balance.test.ts).
const TIER_SCALE = [1, 1.9, 3, 4.2, 5.6];

const strength = (tier: number, dungeonFactor: number) => TIER_SCALE[tier - 1] * dungeonFactor;

function mob(id: string, name: string, scale: number, hp: number, damage: number, element?: string): MobDef {
  return { id, name, hp: Math.round(hp * scale), damage: Math.round(damage * scale), element };
}

function boss(
  id: string,
  name: string,
  scale: number,
  hp: number,
  damage: number,
  effect?: BossDef['effect'],
  element?: string,
): BossDef {
  return { ...mob(id, name, scale, hp, damage, element), effect };
}

const S = {
  ratCellar: strength(1, 1.35),
  goblinWarren: strength(1, 2.73),
  banditStockade: strength(1, 2.08),
  wolfDen: strength(2, 2.00),
  trollBridge: strength(2, 1.98),
  ogreQuarry: strength(2, 1.58),
  hauntedMine: strength(3, 1.84),
  cinderHollow: strength(3, 2.02),
  drownedCrypt: strength(3, 1.63),
  harpyCliffs: strength(4, 1.90),
  orcWarcamp: strength(4, 1.81),
  giantsHall: strength(4, 1.49),
  wyvernPeaks: strength(5, 1.63),
  ashenCitadel: strength(5, 1.69),
  dragonLair: strength(5, 1.40),
};

export const mobs: MobDef[] = [
  // Tier 1
  mob('giantRat', 'giant rat', S.ratCellar, 8, 3),
  mob('cellarSpider', 'cellar spider', S.ratCellar, 12, 4),
  mob('ratSwarm', 'rat swarm', S.ratCellar, 18, 5),
  mob('caveRat', 'cave rat', S.goblinWarren, 8, 3),
  mob('goblin', 'goblin', S.goblinWarren, 14, 4),
  mob('goblinSlinger', 'goblin slinger', S.goblinWarren, 14, 5),
  mob('guardDog', 'guard dog', S.banditStockade, 10, 4),
  mob('bandit', 'bandit', S.banditStockade, 16, 5),
  mob('banditArcher', 'bandit archer', S.banditStockade, 16, 6),
  // Tier 2
  mob('wolfPup', 'wolf pup', S.wolfDen, 8, 3),
  mob('greyWolf', 'grey wolf', S.wolfDen, 14, 4),
  mob('direWolf', 'dire wolf', S.wolfDen, 20, 5),
  mob('bogHound', 'bog hound', S.trollBridge, 10, 4),
  mob('highwayBandit', 'bandit', S.trollBridge, 16, 5),
  mob('riverTroll', 'river troll', S.trollBridge, 24, 6),
  mob('ogreBrute', 'ogre brute', S.ogreQuarry, 12, 4),
  mob('rockGolem', 'rock golem', S.ogreQuarry, 20, 5),
  mob('quarryOgre', 'quarry ogre', S.ogreQuarry, 24, 6),
  // Tier 3
  mob('caveBat', 'cave bat', S.hauntedMine, 8, 3),
  mob('skeletonMiner', 'skeleton miner', S.hauntedMine, 14, 4),
  mob('mineGhost', 'mine ghost', S.hauntedMine, 20, 5),
  mob('fireImp', 'fire imp', S.cinderHollow, 8, 3, 'fire'),
  mob('magmaSlug', 'magma slug', S.cinderHollow, 16, 4, 'fire'),
  mob('emberHound', 'ember hound', S.cinderHollow, 18, 5, 'fire'),
  mob('cryptEel', 'crypt eel', S.drownedCrypt, 10, 4),
  mob('drownedDead', 'drowned dead', S.drownedCrypt, 16, 5),
  mob('boneKnight', 'bone knight', S.drownedCrypt, 22, 6),
  // Tier 4
  mob('rockLizard', 'rock lizard', S.harpyCliffs, 8, 3),
  mob('cliffEagle', 'cliff eagle', S.harpyCliffs, 12, 4),
  mob('harpy', 'harpy', S.harpyCliffs, 18, 5),
  mob('warBoar', 'war boar', S.orcWarcamp, 12, 4),
  mob('orcRaider', 'orc raider', S.orcWarcamp, 16, 5),
  mob('orcShaman', 'orc shaman', S.orcWarcamp, 16, 6),
  mob('giantHound', 'giant hound', S.giantsHall, 12, 4),
  mob('stoneSentinel', 'stone sentinel', S.giantsHall, 20, 5),
  mob('hillGiant', 'hill giant', S.giantsHall, 26, 7),
  // Tier 5
  mob('frostWolf', 'frost wolf', S.wyvernPeaks, 10, 4),
  mob('mountainTroll', 'mountain troll', S.wyvernPeaks, 20, 5),
  mob('wyvern', 'wyvern', S.wyvernPeaks, 22, 6),
  mob('flameCultist', 'flame cultist', S.ashenCitadel, 10, 4, 'fire'),
  mob('cinderGolem', 'cinder golem', S.ashenCitadel, 20, 5, 'fire'),
  mob('ashKnight', 'ash knight', S.ashenCitadel, 22, 6, 'fire'),
  mob('dragonCultist', 'dragon cultist', S.dragonLair, 12, 4, 'fire'),
  mob('drake', 'drake', S.dragonLair, 20, 6, 'fire'),
  mob('fireElemental', 'fire elemental', S.dragonLair, 22, 6, 'fire'),
];

export const bosses: BossDef[] = [
  boss('ratKing', 'rat king', S.ratCellar, 45, 6),
  boss('goblinChief', 'goblin chief', S.goblinWarren, 60, 7),
  boss('banditCaptain', 'bandit captain', S.banditStockade, 110, 9, 'enrage'),
  boss('alphaWolf', 'alpha wolf', S.wolfDen, 55, 7),
  boss('bridgeTroll', 'bridge troll', S.trollBridge, 70, 8),
  boss('ogreChieftain', 'ogre chieftain', S.ogreQuarry, 120, 10, 'sweep'),
  boss('mineWraith', 'mine wraith', S.hauntedMine, 55, 7),
  boss('ashWyrm', 'ash wyrm', S.cinderHollow, 70, 8, undefined, 'fire'),
  boss('lichOfTheDeep', 'lich of the deep', S.drownedCrypt, 125, 10, 'enrage'),
  boss('harpyMatriarch', 'harpy matriarch', S.harpyCliffs, 55, 7, 'sweep'),
  boss('orcWarlord', 'orc warlord', S.orcWarcamp, 75, 8, 'enrage'),
  boss('giantKing', 'giant king', S.giantsHall, 130, 11, 'sweep'),
  boss('wyvernQueen', 'wyvern queen', S.wyvernPeaks, 60, 8, 'sweep'),
  boss('ashLord', 'ash lord', S.ashenCitadel, 80, 9, 'enrage', 'fire'),
  boss('elderDragon', 'elder dragon', S.dragonLair, 140, 12, 'sweep', 'fire'),
];

export const mobById = Object.fromEntries(mobs.map((m) => [m.id, m]));
export const bossById = Object.fromEntries(bosses.map((b) => [b.id, b]));
