import { threatLevelFor } from '@/content/difficulty';
import type { PatrolKind, PatrolSpawn } from '@/game/patrols/generate';
import { wyvernElement } from '@/game/patrols/generate';
import type { Element } from '@/game/elements';
import type {
  ActiveThreat,
  OpportunityDef,
  RestrictionDef,
  ThreatDef,
  ThreatId,
} from '@/game/types';

// Threats, restrictions and opportunities: what a dungeon shows today, and
// the numbers the pure rules in src/game/threats/ play with. Names, emoji and
// descriptions come from the design catalogue (doc/design/threats/).

export const threatDefs: ThreatDef[] = [
  {
    id: 'holy',
    name: 'Holy',
    emoji: '👻',
    icon: require('../../assets/icons/abilities-scaled/skull.png'),
    firstTier: 1,
    penalties: [
      [{ kind: 'enemyHp', tag: 'undead', pct: 0.7 }],
      [{ kind: 'enemyHp', tag: 'undead', pct: 0.8 }],
      [{ kind: 'enemyHp', tag: 'undead', pct: 0.9 }],
    ],
    description: 'The dead walk and the ground is profaned; missed, the undead are harder to put down.',
  },
  {
    id: 'beasts',
    name: 'Beasts',
    emoji: '🐺',
    icon: require('../../assets/icons/abilities-scaled/claw-marks.png'),
    firstTier: 1,
    penalties: [
      [{ kind: 'enemyDamage', tag: 'beast', pct: 1.2 }],
      [{ kind: 'enemyDamage', tag: 'beast', pct: 1.3 }],
      [{ kind: 'enemyDamage', tag: 'beast', pct: 1.4 }],
    ],
    description: 'Beasts prowl here; missed, they hit harder.',
  },
  {
    id: 'darkness',
    name: 'Darkness',
    emoji: '🌑',
    icon: require('../../assets/icons/abilities-scaled/black-hole.png'),
    firstTier: 3,
    penalties: [
      [{ kind: 'exposed', fights: 2 }, { kind: 'weakened', pct: 0.25 }],
      [{ kind: 'exposed', fights: 3 }, { kind: 'weakened', pct: 0.35 }],
      [{ kind: 'exposed', fights: 'all' }, { kind: 'weakened', pct: 0.45 }],
    ],
    description: 'Pitch dark and ambushers; missed, enemies strike first and the party hits softer.',
  },
  {
    id: 'traps',
    name: 'Traps',
    emoji: '🪤',
    icon: require('../../assets/icons/abilities-scaled/rope-snare.png'),
    firstTier: 1,
    penalties: [
      [{ kind: 'trapWounds', pct: 0.4 }],
      [{ kind: 'trapWounds', pct: 0.6 }],
      [{ kind: 'trapWounds', pct: 0.8 }],
    ],
    description: 'Snares, locks and caved-in ways; missed, they wound whoever they catch.',
  },
  {
    id: 'poison',
    name: 'Poison',
    emoji: '☠️',
    icon: require('../../assets/icons/abilities-scaled/blood-drop.png'),
    firstTier: 2,
    penalties: [
      [{ kind: 'fightWounds', pct: 0.4 }],
      [{ kind: 'fightWounds', pct: 0.55 }],
      [{ kind: 'fightWounds', pct: 0.65 }],
    ],
    description: 'Venom in every fight; missed, it wounds the party each time.',
  },
  {
    id: 'element',
    name: 'Element',
    emoji: '☄️',
    icon: require('../../assets/icons/abilities-scaled/fire-vortex.png'),
    firstTier: 1,
    penalties: [
      [{ kind: 'elementalDamage', multiplier: 1.75 }],
      [{ kind: 'elementalDamage', multiplier: 1.9 }],
      [{ kind: 'elementalDamage', multiplier: 2.1 }],
    ],
    description: 'The dungeon’s element everywhere; without Warding, its damage is worse.',
  },
  {
    id: 'armoured',
    name: 'Armoured',
    emoji: '🛡️',
    icon: require('../../assets/icons/abilities-scaled/plate-armor.png'),
    firstTier: 3,
    penalties: [
      [{ kind: 'weakenedAgainst', pct: 0.45 }],
      [{ kind: 'weakenedAgainst', pct: 0.48 }],
      [{ kind: 'weakenedAgainst', pct: 0.52 }],
    ],
    description: 'Armoured enemies; missed, the party’s blows glance off.',
  },
];

export const threatRules = {
  /** A new player's first expeditions (after the tutorial's) face no threats and no restriction: a safe start. */
  safeStartExpeditions: 2,
  /** A half penalty is this share of the full one. */
  halfShare: 0.5,
  /** Salvage of an item with no recipe: this much gold. */
  salvageGold: 3,
  compose: {
    /** Threats per briefing, by dungeon tier (index tier − 1). */
    threatCount: [1, 2, 2, 2, 2],
    /** Hard dungeons draw this many threats more, each at the highest level its tier allows. */
    hardExtraThreats: 1,
    /** The lowest level a hard dungeon's threats take, by tier: tier 1's cap of level 1 would leave hard no harder than medium. */
    hardLevelFloor: [2, 1, 1, 1, 1],
    /** Briefings can carry an opportunity from this tier on. */
    opportunityFromTier: 2,
    /** Restrictions appear from this tier, on this share of days. */
    restrictionFromTier: 4,
    restrictionChance: 0.35,
    /** Weight multipliers by dungeon tier, for tiers that need their own. */
    tierWeights: { 1: { traps: 0.4, beasts: 1.5, holy: 1.5 } } as Partial<Record<number, Partial<Record<ThreatId, number>>>>,
    /** Level weights by rank from the top: the highest level first. */
    levelWeights: [50, 35, 15],
    /** Chance per day and tier that one open dungeon's threat surges. */
    surgeChance: 0.3,
  },
};

export type ThreatRules = typeof threatRules;

export const restrictionDefs: RestrictionDef[] = [
  {
    id: 'antiMagic',
    name: 'Anti-magic zone',
    emoji: '🚫',
    description: 'Magic damage and abilities −50%.',
  },
  {
    id: 'sacredGround',
    name: 'Sacred ground',
    emoji: '⛪',
    description: 'Only Concealed gear hits at full strength; others −40%.',
  },
  {
    id: 'noHealing',
    name: 'No healing',
    emoji: '💔',
    description: 'Potions, party heals and springs heal half as much.',
  },
  { id: 'cursedLuck', name: 'Cursed luck', emoji: '🎲', description: 'No critical hits.' },
  { id: 'barren', name: 'Barren', emoji: '💸', description: 'Gold bonuses from traits, trinkets and meals don’t apply.' },
  { id: 'narrowPassages', name: 'Narrow passages', emoji: '🕳️', description: 'One hero fewer than usual per expedition.' },
  { id: 'spoiledStores', name: 'Spoiled stores', emoji: '🥀', description: 'Meals have no effect; supply still counts.' },
];

/** The numbers the restrictions play with; the rest is what they cut (see their descriptions). */
export const restrictionRules = {
  /** Anti-magic zone: magic damage and healing multiplied by this. */
  antiMagic: 0.5,
  /** Sacred ground: non-concealed weapon damage multiplied by this. */
  sacredGround: 0.6,
  /** No healing: healing during the run multiplied by this. */
  noHealing: 0.5,
  /** Narrow passages: this many heroes fewer than the usual party size. */
  narrowPartyCut: 1,
};

/** The party size Narrow passages allow, from the usual one (never below 1). */
export const narrowPartySize = (partySize: number) => Math.max(1, partySize - restrictionRules.narrowPartyCut);

export const opportunityDefs: OpportunityDef[] = [
  {
    id: 'healingSpring',
    name: 'Healing spring',
    emoji: '⛲',
    description: 'A clear spring; it heals the whole party.',
    answers: [],
    reward: { kind: 'heal', pct: 0.3 },
  },
  {
    id: 'hiddenCache',
    name: 'Hidden cache',
    emoji: '📦',
    description: 'A hidden cache; a deft hand finds the best of it.',
    answers: [
      { family: 'cunning', level: 1 },
      { family: 'plunder', level: 1 },
    ],
    reward: { kind: 'goldShare', share: 0.25 },
  },
  {
    id: 'richVein',
    name: 'Rich vein',
    emoji: '💎',
    description: 'A rich vein of ore; a strong arm works it.',
    answers: [{ family: 'breaker', level: 1 }],
    reward: { kind: 'ore', base: 3, materials: ['wood', 'stone', 'copper', 'iron', 'coal'] },
  },
  {
    id: 'bounty',
    name: 'Bounty',
    emoji: '💰',
    description: 'A bounty on this place; a silver tongue claims it.',
    answers: [{ family: 'rally', level: 1 }],
    reward: { kind: 'goldMultiplier', multiplier: 1.3 },
  },
  {
    id: 'prisoners',
    name: 'Prisoners',
    emoji: '⛓️',
    description: 'Prisoners in chains; freeing them earns their thanks.',
    answers: [{ family: 'rally', level: 2 }],
    reward: { kind: 'prisoners', share: 0.2, recruitChance: 0.1 },
  },
  {
    id: 'refugees',
    name: 'Refugees',
    emoji: '⛺',
    description: 'Refugees on the road; a rallying voice or shared supply earns a pilgrim’s reward.',
    answers: [{ family: 'rally', level: 1 }],
    cost: { supply: 3 },
    reward: { kind: 'pilgrimReward' },
  },
  {
    id: 'forgottenShrine',
    name: 'Forgotten shrine',
    emoji: '🛕',
    description: 'A forgotten shrine; a prayer here steels the party.',
    answers: [{ family: 'faith', level: 2 }],
    reward: { kind: 'partyDamage', multiplier: 1.1 },
  },
  {
    id: 'oldInscriptions',
    name: 'Old inscriptions',
    emoji: '📜',
    description: 'Old inscriptions; a keen eye learns from them.',
    answers: [{ family: 'watch', level: 2 }],
    reward: { kind: 'xp', multiplier: 1.25, recipeChance: 0.2 },
  },
  {
    id: 'trophyBeast',
    name: 'Trophy beast',
    emoji: '🏆',
    description: 'A trophy beast; a beast-hunter takes it.',
    answers: [{ family: 'wild', level: 1 }],
    reward: { kind: 'trophy', hide: [2, 3], bone: 2, shardChance: 0.15 },
  },
  {
    id: 'sealedVault',
    name: 'Sealed vault',
    emoji: '🔐',
    description: 'A sealed vault; a deft hand or a mysterious key opens it, and a won run claims what lies inside.',
    answers: [
      { family: 'cunning', level: 2 },
      { family: 'plunder', level: 2 },
    ],
    cost: { key: 1 },
    reward: { kind: 'vault' },
    weight: 0.5,
  },
];

/** Threats a daily surge can raise, and the surge name it sets on them. */
export const surges: Partial<Record<ThreatId, NonNullable<ActiveThreat['surge']>>> = {
  holy: 'restlessDead',
  traps: 'boobyTrapped',
  beasts: 'packHunt',
};

/** One dungeon's threat table: what can be drawn, and the Element threat's element. */
export type DungeonThreats = { weights: Partial<Record<ThreatId, number>>; element?: Element };

export const dungeonThreats: Record<string, DungeonThreats> = {
  ratCellar: { weights: { beasts: 5, poison: 2, traps: 2, darkness: 3, element: 1 }, element: 'water' },
  spiderBurrow: { weights: { poison: 3, traps: 3, beasts: 3, darkness: 4 } },
  oldGraveyard: { weights: { holy: 7, darkness: 2, traps: 1 } },
  goblinWarren: { weights: { traps: 7, darkness: 4, beasts: 2 } },
  millRuins: { weights: { traps: 6, beasts: 2, armoured: 2 } },
  smugglersCove: { weights: { traps: 7, darkness: 3, element: 1 }, element: 'water' },
  banditStockade: { weights: { darkness: 3, armoured: 4, traps: 5, beasts: 2 } },
  wolfDen: { weights: { beasts: 4, darkness: 4, traps: 2 } },
  barrowMounds: { weights: { holy: 7, darkness: 2, poison: 1, armoured: 1 } },
  boarThicket: { weights: { beasts: 3, element: 3, armoured: 2, poison: 1 }, element: 'grass' },
  trollBridge: { weights: { traps: 4, armoured: 2, beasts: 1, element: 1 }, element: 'water' },
  sunkenFord: { weights: { element: 7, holy: 2, poison: 1 }, element: 'water' },
  watchtower: { weights: { traps: 7, darkness: 4, armoured: 3 } },
  ogreQuarry: { weights: { traps: 5, armoured: 6, beasts: 1 } },
  hauntedMine: { weights: { holy: 5, darkness: 4, traps: 4 } },
  fungalGrotto: { weights: { poison: 4, element: 3, darkness: 2, beasts: 3, traps: 1 }, element: 'grass' },
  stormRidge: { weights: { element: 4, beasts: 3, darkness: 2, traps: 1 }, element: 'electric' },
  cinderHollow: { weights: { element: 4, beasts: 4, darkness: 1, poison: 1 }, element: 'fire' },
  dwarfhold: { weights: { traps: 9, armoured: 3, element: 2, darkness: 2 }, element: 'stone' },
  witchMarsh: { weights: { element: 6, poison: 3, traps: 2, beasts: 1 }, element: 'grass' },
  drownedCrypt: { weights: { holy: 4, element: 8, traps: 3, armoured: 3 }, element: 'water' },
  harpyCliffs: { weights: { beasts: 6, darkness: 3, traps: 2 } },
  thunderPlateau: { weights: { element: 4, beasts: 3, armoured: 4 }, element: 'electric' },
  boneField: { weights: { holy: 7, beasts: 2, armoured: 3 } },
  orcWarcamp: { weights: { darkness: 3, beasts: 3, armoured: 3, traps: 7 } },
  clockworkVault: { weights: { traps: 13, armoured: 4, darkness: 1 } },
  frozenLake: { weights: { element: 7, beasts: 3, darkness: 1 }, element: 'water' },
  giantsHall: { weights: { armoured: 6, traps: 5, beasts: 1 } },
  wyvernPeaks: { weights: { beasts: 5, armoured: 2, traps: 2, darkness: 2 } },
  ossuary: { weights: { holy: 8, darkness: 2, armoured: 2, traps: 1 } },
  stormIsle: { weights: { element: 9, beasts: 2 }, element: 'electric' },
  ashenCitadel: { weights: { element: 7, armoured: 4, holy: 1, traps: 1 }, element: 'fire' },
  abyssalDepths: { weights: { element: 10, darkness: 3, beasts: 2, traps: 1 }, element: 'water' },
  titanRuins: { weights: { traps: 8, armoured: 5, element: 3 }, element: 'stone' },
  dragonLair: { weights: { element: 6, armoured: 5, beasts: 2, traps: 1 }, element: 'fire' },
  nightWatch1: { weights: { darkness: 6, beasts: 2, traps: 1 } },
  nightWatch2: { weights: { darkness: 5, beasts: 3, traps: 2 } },
  nightWatch3: { weights: { holy: 3, darkness: 6, beasts: 1 } },
  nightWatch4: { weights: { darkness: 5, beasts: 3, traps: 2 } },
  nightWatch5: { weights: { darkness: 5, beasts: 2, element: 2, traps: 1 }, element: 'fire' },
};

/** The threat each patrol kind carries in its briefing. */
export const patrolThreatIds: Record<PatrolKind, ThreatId> = {
  goblins: 'darkness',
  eliteGoblins: 'darkness',
  herd: 'beasts',
  wolves: 'beasts',
  bandits: 'darkness',
  outlaws: 'darkness',
  orcs: 'armoured',
  eliteOrcs: 'armoured',
  spiders: 'poison',
  ogres: 'armoured',
  trolls: 'armoured',
  wraiths: 'holy',
  wyverns: 'element',
  golems: 'armoured',
};

/** The threat a patrol spawn carries: its kind's threat, at its difficulty's level. */
export function patrolThreat(spawn: PatrolSpawn): ActiveThreat {
  const id = patrolThreatIds[spawn.kind as PatrolKind];
  const level = (threatLevelFor(spawn.difficulty ?? 'easy', spawn.tier) ?? 1) as ActiveThreat['level'];
  return { id, level, ...(id === 'element' ? { element: wyvernElement(spawn) } : {}) };
}
