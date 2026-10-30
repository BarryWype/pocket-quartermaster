import type { PatrolKind } from '@/game/patrols/generate';
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

/** Hero approach scores: every hero's missing approaches are the base, none pass 5, kits add 2. */
export const approachRules = { base: 1, min: 0, max: 5, kitBonus: 2 };

export const threatDefs: ThreatDef[] = [
  {
    id: 'traps',
    name: 'Traps',
    emoji: '🪤',
    category: 'environment',
    firstTier: 1,
    answer: { kind: 'approach', approach: 'finesse' },
    penalties: [
      [{ kind: 'trapWounds', pct: 0.08 }],
      [{ kind: 'trapWounds', pct: 0.12 }],
      [{ kind: 'trapWounds', pct: 0.18 }],
    ],
    description: 'Snare pits and tripwires; missed, they wound whoever they catch.',
  },
  {
    id: 'element',
    name: 'Element',
    emoji: '☄️',
    category: 'environment',
    firstTier: 1,
    answer: { kind: 'resist' },
    penalties: [
      [{ kind: 'elementalDamage', multiplier: 1.25 }],
      [{ kind: 'elementalDamage', multiplier: 1.5 }],
      [{ kind: 'elementalDamage', multiplier: 1.75 }],
    ],
    description: 'The dungeon’s element everywhere; without Resist, its damage is worse.',
  },
  {
    id: 'beasts',
    name: 'Beasts',
    emoji: '🐺',
    category: 'enemy',
    firstTier: 1,
    answer: { kind: 'keyword', keyword: 'calm' },
    penalties: [
      [{ kind: 'enemyDamage', tag: 'beast', pct: 0.2 }],
      [{ kind: 'enemyDamage', tag: 'beast', pct: 0.35 }],
      [{ kind: 'enemyDamage', tag: 'beast', pct: 0.5 }],
    ],
    description: 'Beasts prowl here; missed, they hit harder.',
  },
  {
    id: 'undead',
    name: 'Undead',
    emoji: '👻',
    category: 'enemy',
    firstTier: 1,
    answer: { kind: 'keyword', keyword: 'blessed' },
    penalties: [
      [{ kind: 'enemyHp', tag: 'undead', pct: 0.2 }],
      [{ kind: 'enemyHp', tag: 'undead', pct: 0.4 }],
      [{ kind: 'enemyHp', tag: 'undead', pct: 0.6 }],
    ],
    description: 'The dead walk here; missed, they are harder to put down.',
  },
  {
    id: 'brute',
    name: 'Brute',
    emoji: '👊',
    category: 'enemy',
    firstTier: 1,
    answer: { kind: 'keyword', keyword: 'guard' },
    penalties: [
      [{ kind: 'bruteDamage', pct: 0.25 }],
      [{ kind: 'bruteDamage', pct: 0.5 }],
      [{ kind: 'bruteDamage', pct: 0.75 }],
    ],
    description: 'A brute of a boss; missed, it hits harder.',
  },
  {
    id: 'rubble',
    name: 'Rubble',
    emoji: '🪨',
    category: 'obstacle',
    firstTier: 2,
    answer: { kind: 'approach', approach: 'might' },
    penalties: [
      [{ kind: 'delay', pct: 0.1 }, { kind: 'hunger', supply: 1 }],
      [{ kind: 'delay', pct: 0.2 }, { kind: 'hunger', supply: 1 }],
      [{ kind: 'delay', pct: 0.3 }, { kind: 'hunger', supply: 2 }],
    ],
    description: 'Caved-in ways; missed, the party loses time and supply.',
  },
  {
    id: 'poison',
    name: 'Poison',
    emoji: '☠️',
    category: 'environment',
    firstTier: 2,
    answer: { kind: 'keyword', keyword: 'antidote' },
    penalties: [
      [{ kind: 'fightWounds', pct: 0.05, targets: 'all' }],
      [{ kind: 'fightWounds', pct: 0.1, targets: 'all' }],
      [{ kind: 'fightWounds', pct: 0.15, targets: 'all' }],
    ],
    description: 'Venom in every fight; missed, it wounds the party each time.',
  },
  {
    id: 'locals',
    name: 'Locals',
    emoji: '🤝',
    category: 'social',
    firstTier: 2,
    answer: { kind: 'approach', approach: 'presence' },
    alternative: 'might',
    penalties: [[{ kind: 'extraFight' }], [{ kind: 'extraFight' }], [{ kind: 'extraFight' }]],
    description: 'Locals live here; missed, they turn hostile.',
  },
  {
    id: 'swarm',
    name: 'Swarm',
    emoji: '🐜',
    category: 'enemy',
    firstTier: 2,
    answer: { kind: 'keyword', keyword: 'cleave' },
    penalties: [
      [{ kind: 'extraEnemies', count: 1 }],
      [{ kind: 'extraEnemies', count: 2 }],
      [{ kind: 'extraEnemies', count: 3 }],
    ],
    description: 'Enemies in swarms; missed, every big fight has more of them.',
  },
  {
    id: 'darkness',
    name: 'Darkness',
    emoji: '🌑',
    category: 'environment',
    firstTier: 3,
    answer: { kind: 'keyword', keyword: 'light' },
    penalties: [
      [{ kind: 'exposed', fights: 1 }],
      [{ kind: 'exposed', fights: 2 }, { kind: 'weakened', pct: 0.1 }],
      [{ kind: 'exposed', fights: 'all' }, { kind: 'weakened', pct: 0.2 }],
    ],
    description: 'Pitch dark; missed, enemies strike first and the party hits softer.',
  },
  {
    id: 'locked',
    name: 'Locked',
    emoji: '🔒',
    category: 'obstacle',
    firstTier: 3,
    answer: { kind: 'approach', approach: 'finesse' },
    alternative: 'might',
    penalties: [
      [{ kind: 'lostLoot', pct: 0.15 }],
      [{ kind: 'lostLoot', pct: 0.25 }],
      [{ kind: 'lostLoot', pct: 0.4 }],
    ],
    description: 'Locked ways; missed, some loot stays behind.',
  },
  {
    id: 'desecrated',
    name: 'Desecrated ground',
    emoji: '🪦',
    category: 'holy',
    firstTier: 3,
    answer: { kind: 'approach', approach: 'faith' },
    penalties: [
      [{ kind: 'weakened', pct: 0.1 }],
      [{ kind: 'weakened', pct: 0.2 }],
      [{ kind: 'weakened', pct: 0.3 }, { kind: 'healingHalved' }],
    ],
    description: 'Profaned ground; missed, the party is weakened and heals half as well.',
  },
  {
    id: 'casters',
    name: 'Casters',
    emoji: '🔮',
    category: 'enemy',
    firstTier: 3,
    answer: { kind: 'approach', approach: 'faith' },
    penalties: [
      [{ kind: 'fightWounds', pct: 0.06, targets: 'one' }],
      [{ kind: 'fightWounds', pct: 0.1, targets: 'one' }],
      [{ kind: 'fightWounds', pct: 0.15, targets: 'one' }],
    ],
    description: 'Enemy casters; missed, they wound a hero before every fight.',
  },
  {
    id: 'ambush',
    name: 'Ambush',
    emoji: '💥',
    category: 'enemy',
    firstTier: 3,
    answer: { kind: 'keyword', keyword: 'watchful' },
    penalties: [
      [{ kind: 'exposed', fights: 1 }],
      [{ kind: 'exposed', fights: 2 }],
      [{ kind: 'exposed', fights: 'all' }],
    ],
    description: 'Ambushers on the paths; missed, enemies strike first.',
  },
  {
    id: 'thieves',
    name: 'Thieves',
    emoji: '🥷',
    category: 'enemy',
    firstTier: 3,
    answer: { kind: 'approach', approach: 'finesse' },
    penalties: [
      [{ kind: 'lostLoot', pct: 0.1 }],
      [{ kind: 'lostLoot', pct: 0.2 }],
      [{ kind: 'lostLoot', pct: 0.3 }],
    ],
    description: 'Thieves on the paths; missed, they make off with loot.',
  },
  {
    id: 'armoured',
    name: 'Armoured',
    emoji: '🛡️',
    category: 'enemy',
    firstTier: 3,
    answer: { kind: 'keyword', keyword: 'pierce' },
    penalties: [
      [{ kind: 'weakenedAgainst', pct: 0.2 }],
      [{ kind: 'weakenedAgainst', pct: 0.35 }],
      [{ kind: 'weakenedAgainst', pct: 0.5 }],
    ],
    description: 'Armoured enemies; missed, the party’s blows glance off.',
  },
  {
    id: 'puzzle',
    name: 'Puzzle',
    emoji: '🧩',
    category: 'obstacle',
    firstTier: 4,
    answer: { kind: 'approach', approach: 'wits' },
    penalties: [
      [{ kind: 'delay', pct: 0.15 }, { kind: 'hunger', supply: 1 }],
      [{ kind: 'delay', pct: 0.3 }, { kind: 'hunger', supply: 2 }],
      [{ kind: 'delay', pct: 0.45 }, { kind: 'hunger', supply: 2 }],
    ],
    description: 'An old puzzle; missed, the party loses time and supply.',
  },
  {
    id: 'maze',
    name: 'Maze',
    emoji: '🌀',
    category: 'environment',
    firstTier: 4,
    answer: { kind: 'approach', approach: 'wits' },
    penalties: [
      [{ kind: 'delay', pct: 0.2 }, { kind: 'hunger', supply: 1 }],
      [{ kind: 'delay', pct: 0.35 }, { kind: 'hunger', supply: 2 }],
      [{ kind: 'delay', pct: 0.5 }, { kind: 'hunger', supply: 3 }],
    ],
    description: 'Twisting passages; missed, the party loses time and supply.',
  },
  {
    id: 'underwater',
    name: 'Underwater',
    emoji: '🌊',
    category: 'environment',
    firstTier: 4,
    answer: { kind: 'approach', approach: 'wits' },
    penalties: [
      [{ kind: 'weakened', pct: 0.15 }],
      [{ kind: 'weakened', pct: 0.25 }],
      [{ kind: 'weakened', pct: 0.4 }],
    ],
    description: 'Flooded ways; missed, the party fights out of its depth, weakened.',
  },
];

export const threatRules = {
  /** Score needed to meet an approach / keyword threat at levels 1, 2 and 3. */
  levels: { approach: [2, 3, 4], keyword: [1, 2, 3] },
  /** A half penalty is this share of the full one. */
  halfShare: 0.5,
  /** Locked forced with Might: this share of the loot is lost. */
  forcedLockLoss: 0.1,
  /** Salvage of an item with no recipe: this much gold. */
  salvageGold: 3,
  compose: {
    /** Threats per briefing, by dungeon tier (index tier − 1). */
    threatCount: [1, 2, 2, 2, 2],
    /** Briefings can carry an opportunity from this tier on. */
    opportunityFromTier: 2,
    /** Restrictions appear from this tier, on this share of days. */
    restrictionFromTier: 4,
    restrictionChance: 0.35,
    /** Weight multiplier for a threat drawn before its kit's tier. */
    beforeKitWeight: 0.5,
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
    description: 'Magic damage and abilities −50%; keywords from magic gear and casters don’t count.',
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
  { id: 'thickFog', name: 'Thick fog', emoji: '🌫️', description: 'Watchful doesn’t count; Ambush can only be answered by a kit.' },
  { id: 'barren', name: 'Barren', emoji: '💸', description: 'Gold bonuses from traits, charms and meals don’t apply.' },
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
    answers: [{ approach: 'finesse', score: 2 }],
    reward: { kind: 'goldShare', share: 0.25 },
  },
  {
    id: 'richVein',
    name: 'Rich vein',
    emoji: '💎',
    description: 'A rich vein of ore; a strong arm works it.',
    answers: [{ approach: 'might', score: 2 }],
    reward: { kind: 'ore', base: 3, materials: ['wood', 'stone', 'copper', 'iron', 'coal'] },
  },
  {
    id: 'bounty',
    name: 'Bounty',
    emoji: '💰',
    description: 'A bounty on this place; a silver tongue claims it.',
    answers: [{ approach: 'presence', score: 2 }],
    reward: { kind: 'goldMultiplier', multiplier: 1.3 },
  },
  {
    id: 'prisoners',
    name: 'Prisoners',
    emoji: '⛓️',
    description: 'Prisoners in chains; freeing them earns their thanks.',
    answers: [
      { approach: 'finesse', score: 3 },
      { approach: 'might', score: 3 },
    ],
    reward: { kind: 'prisoners', share: 0.2, recruitChance: 0.1 },
  },
  {
    id: 'refugees',
    name: 'Refugees',
    emoji: '⛺',
    description: 'Refugees on the road; shared supply earns a pilgrim’s reward.',
    answers: [],
    cost: { supply: 3 },
    reward: { kind: 'pilgrimReward' },
  },
  {
    id: 'forgottenShrine',
    name: 'Forgotten shrine',
    emoji: '🛕',
    description: 'A forgotten shrine; a prayer here steels the party.',
    answers: [{ approach: 'faith', score: 3 }],
    reward: { kind: 'partyDamage', multiplier: 1.1 },
  },
  {
    id: 'oldInscriptions',
    name: 'Old inscriptions',
    emoji: '📜',
    description: 'Old inscriptions; a sharp mind learns from them.',
    answers: [{ approach: 'wits', score: 3 }],
    reward: { kind: 'xp', multiplier: 1.25, recipeChance: 0.2 },
  },
  {
    id: 'trophyBeast',
    name: 'Trophy beast',
    emoji: '🏆',
    description: 'A trophy beast; a calm hand or a strong arm takes it.',
    answers: [{ keyword: 'calm' }, { approach: 'might', score: 3 }],
    reward: { kind: 'trophy', hide: [2, 3], bone: 2, shardChance: 0.15 },
  },
  {
    id: 'sealedVault',
    name: 'Sealed vault',
    emoji: '🔐',
    description: 'A sealed vault; a mysterious key opens it, and a won run claims what lies inside.',
    answers: [],
    cost: { key: 1 },
    reward: { kind: 'vault' },
    weight: 0.5,
  },
];

/** Threats a daily surge can raise, and the surge name it sets on them. */
export const surges: Partial<Record<ThreatId, NonNullable<ActiveThreat['surge']>>> = {
  undead: 'restlessDead',
  traps: 'boobyTrapped',
  beasts: 'packHunt',
};

/** One dungeon's threat table: what can be drawn, and the Element threat's element. */
export type DungeonThreats = { weights: Partial<Record<ThreatId, number>>; element?: Element };

export const dungeonThreats: Record<string, DungeonThreats> = {
  ratCellar: { weights: { beasts: 3, poison: 2, traps: 2, darkness: 2, swarm: 2, ambush: 1, element: 1 }, element: 'water' },
  spiderBurrow: { weights: { poison: 3, traps: 3, beasts: 2, darkness: 2, ambush: 2, swarm: 1 } },
  oldGraveyard: { weights: { undead: 4, desecrated: 3, darkness: 2, traps: 1, locals: 1, casters: 1 } },
  goblinWarren: { weights: { rubble: 3, ambush: 3, traps: 2, swarm: 2, thieves: 2, darkness: 1 } },
  millRuins: { weights: { rubble: 4, beasts: 2, locals: 2, brute: 2, thieves: 1, traps: 1 } },
  smugglersCove: { weights: { thieves: 4, locals: 3, locked: 2, ambush: 2, traps: 1, darkness: 1, element: 1 }, element: 'water' },
  banditStockade: { weights: { ambush: 3, brute: 3, thieves: 2, traps: 2, beasts: 2, armoured: 1, rubble: 1 } },
  wolfDen: { weights: { beasts: 4, ambush: 3, darkness: 1, rubble: 1, traps: 1 } },
  barrowMounds: { weights: { undead: 4, desecrated: 3, darkness: 2, poison: 1, armoured: 1, maze: 1 } },
  boarThicket: { weights: { beasts: 3, element: 3, locals: 2, brute: 2, poison: 1 }, element: 'grass' },
  trollBridge: { weights: { locals: 4, thieves: 3, brute: 2, beasts: 1, rubble: 1, element: 1 }, element: 'water' },
  sunkenFord: { weights: { element: 4, underwater: 3, undead: 2, poison: 1, rubble: 1 }, element: 'water' },
  watchtower: { weights: { locked: 3, ambush: 3, armoured: 2, rubble: 2, traps: 2, darkness: 1, brute: 1 } },
  ogreQuarry: { weights: { rubble: 4, brute: 3, armoured: 3, traps: 1, swarm: 1 } },
  hauntedMine: { weights: { undead: 4, darkness: 4, rubble: 2, maze: 2, locals: 1, desecrated: 1 } },
  fungalGrotto: { weights: { poison: 4, element: 3, darkness: 2, swarm: 2, beasts: 1, maze: 1 }, element: 'grass' },
  stormRidge: { weights: { element: 4, beasts: 3, ambush: 2, rubble: 1 }, element: 'electric' },
  cinderHollow: { weights: { element: 4, beasts: 2, swarm: 2, darkness: 1, poison: 1 }, element: 'fire' },
  dwarfhold: { weights: { puzzle: 4, locked: 3, armoured: 3, element: 2, traps: 2, darkness: 2, locals: 1 }, element: 'stone' },
  witchMarsh: { weights: { casters: 3, element: 3, locals: 3, poison: 3, maze: 2, beasts: 1 }, element: 'grass' },
  drownedCrypt: {
    weights: { undead: 4, underwater: 3, casters: 3, traps: 2, armoured: 2, element: 2, locked: 1, brute: 1 },
    element: 'water',
  },
  harpyCliffs: { weights: { beasts: 4, ambush: 3, swarm: 2, rubble: 2 } },
  thunderPlateau: { weights: { element: 4, beasts: 3, armoured: 2, brute: 2 }, element: 'electric' },
  boneField: { weights: { undead: 4, desecrated: 3, swarm: 2, armoured: 2, casters: 1, brute: 1 } },
  orcWarcamp: { weights: { ambush: 3, swarm: 3, brute: 3, thieves: 2, traps: 2, casters: 2, rubble: 2, locked: 1 } },
  clockworkVault: { weights: { traps: 4, puzzle: 4, armoured: 4, locked: 3, maze: 2, darkness: 1 } },
  frozenLake: { weights: { element: 4, underwater: 3, beasts: 3, ambush: 1 }, element: 'water' },
  giantsHall: { weights: { brute: 4, rubble: 3, armoured: 2, beasts: 1, traps: 1, locked: 1 } },
  wyvernPeaks: { weights: { beasts: 4, brute: 2, rubble: 2, ambush: 2, swarm: 1 } },
  ossuary: { weights: { undead: 4, desecrated: 4, darkness: 2, armoured: 2, locked: 1, casters: 1 } },
  stormIsle: { weights: { element: 4, casters: 3, beasts: 2, underwater: 2 }, element: 'electric' },
  ashenCitadel: { weights: { element: 4, casters: 3, armoured: 2, brute: 2, undead: 1, locked: 1 }, element: 'fire' },
  abyssalDepths: { weights: { underwater: 4, element: 4, darkness: 3, beasts: 2, casters: 2, maze: 1 }, element: 'water' },
  titanRuins: { weights: { rubble: 4, armoured: 3, element: 3, puzzle: 2, brute: 2, maze: 2, locals: 1 }, element: 'stone' },
  dragonLair: { weights: { element: 4, brute: 3, beasts: 2, casters: 2, armoured: 2, locked: 1 }, element: 'fire' },
  nightWatch1: { weights: { ambush: 3, darkness: 3, beasts: 2, thieves: 1 } },
  nightWatch2: { weights: { ambush: 3, beasts: 3, darkness: 2, thieves: 1, traps: 1 } },
  nightWatch3: { weights: { undead: 3, ambush: 3, darkness: 3, beasts: 1 } },
  nightWatch4: { weights: { ambush: 3, beasts: 3, thieves: 2, darkness: 2 } },
  nightWatch5: { weights: { ambush: 3, beasts: 2, darkness: 2, element: 2, thieves: 1 }, element: 'fire' },
};

/** The threat each patrol kind carries in its briefing. */
export const patrolThreats: Record<PatrolKind, ActiveThreat> = {
  goblins: { id: 'ambush', level: 1 },
  herd: { id: 'beasts', level: 1 },
  bandits: { id: 'thieves', level: 1 },
};
