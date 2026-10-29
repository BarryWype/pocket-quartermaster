import type { HeroClassDef, HeroClassId, HeroState } from '@/game/types';

// Heroes keep modest bases and grow mostly through their three primary stats
// (every level) and milestone steps for the rest (levels 5, 10, 15). Gear
// still provides most of their power; a class's favoured types (see
// content/equipment.ts) give 1.2× their scaling stats.
// Max level is 15: level 15 lands on the tier 5 boss under the XP curve below.
export const heroClasses: Record<HeroClassId, HeroClassDef> = {
  warrior: {
    name: 'Warrior',
    emoji: '🛡️',
    rarity: 'common',
    baseStats: { hp: 30, power: 4, magic: 0, armour: 3, resistance: 1, evasion: 0, speed: 5, crit: 5 },
    primary: ['hp', 'power', 'armour'],
    damageStat: 'power',
    approaches: { might: 3 },
    keywords: [],
    threat: 3,
    abilities: [],
  },
  ranger: {
    name: 'Ranger',
    emoji: '🏹',
    rarity: 'common',
    baseStats: { hp: 24, power: 5, magic: 0, armour: 1, resistance: 1, evasion: 5, speed: 7, crit: 5 },
    primary: ['power', 'evasion', 'speed'],
    damageStat: 'power',
    approaches: { wits: 3 },
    keywords: ['watchful'],
    threat: 1,
    abilities: [
      { kind: 'trapReduce', multiplier: 0.5 },
      { kind: 'damageVsTag', tag: 'beast', multiplier: 1.5 },
    ],
  },
  fireMage: {
    name: 'Fire mage',
    emoji: '🔥',
    rarity: 'common',
    element: 'fire',
    baseStats: { hp: 22, power: 0, magic: 6, armour: 0, resistance: 1, evasion: 0, speed: 7, crit: 10 },
    primary: ['magic', 'speed', 'crit'],
    damageStat: 'magic',
    approaches: {},
    keywords: ['light', 'cleave'],
    resists: ['fire'],
    threat: 1,
    abilities: [],
  },
  frostMage: {
    name: 'Frost mage',
    emoji: '❄️',
    rarity: 'common',
    element: 'water',
    baseStats: { hp: 22, power: 0, magic: 6, armour: 0, resistance: 3, evasion: 0, speed: 5, crit: 5 },
    primary: ['magic', 'armour', 'resistance'],
    damageStat: 'magic',
    approaches: { wits: 3 },
    keywords: [],
    resists: ['water'],
    threat: 1,
    abilities: [],
  },
  thief: {
    name: 'Thief',
    emoji: '🗝️',
    rarity: 'uncommon',
    baseStats: { hp: 22, power: 5, magic: 0, armour: 1, resistance: 1, evasion: 5, speed: 5, crit: 10 },
    primary: ['power', 'evasion', 'crit'],
    damageStat: 'power',
    approaches: { finesse: 4 },
    keywords: [],
    threat: 1,
    abilities: [
      { kind: 'pickpocket' },
      { kind: 'critBonus', chance: 0.15 },
      { kind: 'cacheBonus', multiplier: 2 },
    ],
  },
  barbarian: {
    name: 'Barbarian',
    emoji: '🪓',
    rarity: 'uncommon',
    baseStats: { hp: 32, power: 6, magic: 0, armour: 0, resistance: 1, evasion: 0, speed: 5, crit: 10 },
    primary: ['hp', 'power', 'crit'],
    damageStat: 'power',
    approaches: { might: 3 },
    keywords: ['cleave'],
    threat: 2,
    abilities: [{ kind: 'rage', belowPct: 0.5, multiplier: 1.4 }],
  },
  cleric: {
    name: 'Cleric',
    emoji: '✝️',
    rarity: 'uncommon',
    baseStats: { hp: 26, power: 2, magic: 3, armour: 2, resistance: 3, evasion: 0, speed: 5, crit: 5 },
    primary: ['hp', 'magic', 'resistance'],
    damageStat: 'magic',
    approaches: { faith: 3 },
    keywords: ['antidote', 'blessed'],
    threat: 1.5,
    abilities: [{ kind: 'partyHeal', pct: 0.06 }],
  },
  paladin: {
    name: 'Paladin',
    emoji: '⚜️',
    rarity: 'uncommon',
    baseStats: { hp: 32, power: 3, magic: 0, armour: 4, resistance: 3, evasion: 0, speed: 5, crit: 5 },
    primary: ['hp', 'armour', 'resistance'],
    damageStat: 'power',
    approaches: { faith: 3 },
    keywords: ['blessed', 'guard'],
    threat: 2.5,
    abilities: [{ kind: 'protect', share: 0.5 }],
  },
  druid: {
    name: 'Druid',
    emoji: '🌿',
    rarity: 'uncommon',
    element: 'grass',
    baseStats: { hp: 24, power: 0, magic: 5, armour: 1, resistance: 1, evasion: 5, speed: 5, crit: 5 },
    primary: ['hp', 'magic', 'evasion'],
    damageStat: 'magic',
    approaches: {},
    keywords: ['calm', 'antidote'],
    threat: 1,
    abilities: [],
  },
  troubadour: {
    name: 'Troubadour',
    emoji: '🎻',
    rarity: 'uncommon',
    baseStats: { hp: 22, power: 2, magic: 2, armour: 1, resistance: 1, evasion: 5, speed: 7, crit: 5 },
    primary: ['magic', 'evasion', 'speed'],
    damageStat: 'magic',
    approaches: { presence: 3 },
    keywords: [],
    threat: 0.8,
    abilities: [{ kind: 'partyDamageBuff', multiplier: 1.15 }],
  },
  sorcerer: {
    name: 'Sorcerer',
    emoji: '🔮',
    rarity: 'uncommon',
    baseStats: { hp: 20, power: 0, magic: 6, armour: 0, resistance: 3, evasion: 0, speed: 5, crit: 10 },
    primary: ['magic', 'resistance', 'crit'],
    damageStat: 'magic',
    approaches: { wits: 3 },
    keywords: [],
    threat: 1,
    abilities: [{ kind: 'elementalAdvantage', multiplier: 1.8 }],
  },
};

export const newHero = (id: string, name: string, classId: HeroClassId, trait: string, level = 1): HeroState => ({
  id,
  name,
  classId,
  trait,
  level,
  xp: 0,
  equipment: { weapon: null, armor: null, offhand: null, trinket: null, consumable: null },
});

export const startingHeroes: HeroState[] = [
  newHero('bram', 'Bram', 'warrior', 'resilient'),
  newHero('lyra', 'Lyra', 'ranger', 'lucky'),
  newHero('mira', 'Mira', 'fireMage', 'quickLearner'),
];

export const xpRules = {
  /** XP to go from level L to L + 1: round(base × L^exponent). */
  base: 25,
  exponent: 1.65,
  /** No XP past this level; the curve lands it on the tier 5 boss. */
  maxLevel: 15,
  /** Share of XP from dungeons 0, 1, and 2 or more tiers below the highest unlocked tier. */
  lowerTierShare: [1, 0.5, 0.25],
};

/** XP needed to go from `level` to `level + 1`. */
export const xpToNextLevel = (level: number, rules: typeof xpRules = xpRules) => Math.round(rules.base * level ** rules.exponent);

/** Growth rules (see team/stats.ts): steps per level, milestones, Luck and the recruit roll's pull. */
export const growthRules = {
  /** A primary stat gains its step every level; secondaries at the milestones. */
  steps: { hp: 8, power: 2, magic: 2, armour: 1, resistance: 1, evasion: 1, speed: 1, crit: 1 },
  /** Levels at which the secondary stats gain a step. */
  milestones: [5, 10, 15],
  /** Levels at which a hero picks an approach (see team/stats.ts). */
  approachMilestones: [5, 10],
  /** Luck is gained at this level. */
  luckLevel: 15,
  luck: 1,
  /** A 3d6 roll's pull on the stats: the average is 10.5, sums span 3–18. */
  roll: { average: 10.5, spread: 7.5, base: 0.15, growth: 0.08 },
};
