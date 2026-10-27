import type { HeroClassDef, HeroClassId, HeroState } from '@/game/types';

// Heroes are deliberately modest: gear provides most of their power, and a
// level adds only a little, so levelling up never replaces forging better gear.
// Damage dealers have a ×1.5 affinity with their weapons; support classes
// (cleric, paladin, troubadour) have less and earn their place with abilities.
export const heroClasses: Record<HeroClassId, HeroClassDef> = {
  warrior: {
    name: 'Warrior',
    emoji: '🛡️',
    rarity: 'common',
    baseStats: { attack: 4, defense: 3, magic: 0, hp: 30 },
    growth: { attack: 0.6, defense: 0.5, magic: 0, hp: 3 },
    affinities: { sword: 1.5 },
    threat: 3,
    abilities: [{ kind: 'obstacleSolve', kinds: ['rubble'] }],
  },
  ranger: {
    name: 'Ranger',
    emoji: '🏹',
    rarity: 'common',
    baseStats: { attack: 5, defense: 1, magic: 0, hp: 24 },
    growth: { attack: 0.7, defense: 0.3, magic: 0.1, hp: 2.5 },
    affinities: { bow: 1.5 },
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
    baseStats: { attack: 0, defense: 0, magic: 6, hp: 22 },
    growth: { attack: 0.1, defense: 0.3, magic: 0.8, hp: 2 },
    affinities: { wand: 1.5 },
    resists: ['fire'],
    threat: 1,
    abilities: [{ kind: 'obstacleSolve', kinds: ['barricade'] }],
  },
  frostMage: {
    name: 'Frost mage',
    emoji: '❄️',
    rarity: 'common',
    element: 'water',
    baseStats: { attack: 0, defense: 0, magic: 6, hp: 22 },
    growth: { attack: 0.1, defense: 0.3, magic: 0.8, hp: 2 },
    affinities: { wand: 1.5 },
    resists: ['water'],
    threat: 1,
    abilities: [],
  },
  thief: {
    name: 'Thief',
    emoji: '🗝️',
    rarity: 'uncommon',
    baseStats: { attack: 5, defense: 1, magic: 0, hp: 22 },
    growth: { attack: 0.7, defense: 0.2, magic: 0, hp: 2 },
    affinities: { dagger: 1.5 },
    threat: 1,
    abilities: [
      { kind: 'trapDisarm', chance: 0.6 },
      { kind: 'obstacleSolve', kinds: ['locked'] },
      { kind: 'localsReaction', key: 'pickpocket' },
      { kind: 'critBonus', chance: 0.15 },
      { kind: 'cacheBonus', multiplier: 2 },
    ],
  },
  barbarian: {
    name: 'Barbarian',
    emoji: '🪓',
    rarity: 'uncommon',
    baseStats: { attack: 6, defense: 0, magic: 0, hp: 32 },
    growth: { attack: 0.8, defense: 0.2, magic: 0, hp: 3.5 },
    affinities: { axe: 1.5 },
    threat: 2,
    abilities: [
      { kind: 'obstacleSolve', kinds: ['rubble'] },
      { kind: 'localsReaction', key: 'provoke' },
      { kind: 'rage', belowPct: 0.5, multiplier: 1.4 },
    ],
  },
  cleric: {
    name: 'Cleric',
    emoji: '✝️',
    rarity: 'uncommon',
    baseStats: { attack: 2, defense: 2, magic: 3, hp: 26 },
    growth: { attack: 0.3, defense: 0.4, magic: 0.4, hp: 2.5 },
    affinities: { mace: 1.25 },
    threat: 1.5,
    abilities: [
      { kind: 'partyHeal', pct: 0.06 },
      { kind: 'damageVsTag', tag: 'undead', multiplier: 1.5 },
    ],
  },
  paladin: {
    name: 'Paladin',
    emoji: '⚜️',
    rarity: 'uncommon',
    baseStats: { attack: 3, defense: 4, magic: 0, hp: 32 },
    growth: { attack: 0.5, defense: 0.6, magic: 0, hp: 3.5 },
    affinities: { sword: 1.25, mace: 1.25 },
    threat: 2.5,
    abilities: [
      { kind: 'damageVsTag', tag: 'undead', multiplier: 1.5 },
      { kind: 'protect', share: 0.5 },
    ],
  },
  druid: {
    name: 'Druid',
    emoji: '🌿',
    rarity: 'uncommon',
    element: 'grass',
    baseStats: { attack: 0, defense: 1, magic: 5, hp: 24 },
    growth: { attack: 0.1, defense: 0.3, magic: 0.7, hp: 2.5 },
    affinities: { staff: 1.5 },
    threat: 1,
    abilities: [{ kind: 'calmBeasts', chance: 0.5 }],
  },
  troubadour: {
    name: 'Troubadour',
    emoji: '🎻',
    rarity: 'uncommon',
    baseStats: { attack: 2, defense: 1, magic: 2, hp: 22 },
    growth: { attack: 0.3, defense: 0.3, magic: 0.3, hp: 2 },
    affinities: { instrument: 1 },
    threat: 0.8,
    abilities: [
      { kind: 'localsReaction', key: 'charm' },
      { kind: 'partyDamageBuff', multiplier: 1.15 },
    ],
  },
  sorcerer: {
    name: 'Sorcerer',
    emoji: '🔮',
    rarity: 'uncommon',
    baseStats: { attack: 0, defense: 0, magic: 6, hp: 20 },
    growth: { attack: 0.1, defense: 0.2, magic: 0.9, hp: 1.8 },
    affinities: { wand: 1.5 },
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
  equipment: { weapon: null, armor: null, consumable: null },
});

export const startingHeroes: HeroState[] = [
  newHero('bram', 'Bram', 'warrior', 'resilient'),
  newHero('lyra', 'Lyra', 'ranger', 'lucky'),
  newHero('mira', 'Mira', 'fireMage', 'quickLearner'),
];

export const xpRules = {
  /** XP to go from level L to L + 1: round(base × L^exponent). */
  base: 100,
  exponent: 1.5,
  /** Share of XP from dungeons 0, 1, and 2 or more tiers below the highest unlocked tier. */
  lowerTierShare: [1, 0.5, 0.25],
};

/** XP needed to go from `level` to `level + 1`. */
export const xpToNextLevel = (level: number, rules: typeof xpRules = xpRules) => Math.round(rules.base * level ** rules.exponent);
