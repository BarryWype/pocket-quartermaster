import type { HeroClassDef, HeroClassId, HeroState } from '@/game/types';

// Heroes are deliberately modest: gear provides most of their power, and a
// level adds only a little, so levelling up never replaces forging better gear.
export const heroClasses: Record<HeroClassId, HeroClassDef> = {
  warrior: {
    name: 'Warrior',
    emoji: '🛡️',
    baseStats: { attack: 4, defense: 3, magic: 0, hp: 30 },
    growth: { attack: 0.6, defense: 0.5, magic: 0, hp: 3 },
    affinities: { sword: 1.5 },
    threat: 3,
  },
  archer: {
    name: 'Archer',
    emoji: '🏹',
    baseStats: { attack: 5, defense: 1, magic: 0, hp: 24 },
    growth: { attack: 0.7, defense: 0.3, magic: 0.1, hp: 2.5 },
    affinities: { bow: 1.5 },
    threat: 1,
  },
  fireMage: {
    name: 'Fire mage',
    emoji: '🔥',
    baseStats: { attack: 0, defense: 0, magic: 6, hp: 22 },
    growth: { attack: 0.1, defense: 0.3, magic: 0.8, hp: 2 },
    affinities: { wand: 1.5 },
    resists: ['fire'],
    threat: 1,
  },
};

const newHero = (id: string, name: string, classId: HeroClassId): HeroState => ({
  id,
  name,
  classId,
  level: 1,
  xp: 0,
  equipment: { weapon: null, armor: null, consumable: null },
});

export const startingHeroes: HeroState[] = [
  newHero('bram', 'Bram', 'warrior'),
  newHero('lyra', 'Lyra', 'archer'),
  newHero('mira', 'Mira', 'fireMage'),
];

/** XP needed to go from `level` to `level + 1`. */
export const xpToNextLevel = (level: number) => 100 * level;
