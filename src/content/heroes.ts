import type { HeroClassDef, HeroClassId, HeroState } from '@/game/types';

export const heroClasses: Record<HeroClassId, HeroClassDef> = {
  warrior: {
    name: 'Warrior',
    emoji: '🛡️',
    baseStats: { attack: 5, defense: 5, magic: 0, hp: 40 },
    growth: { attack: 2, defense: 2, magic: 0, hp: 8 },
    affinities: { sword: 1.5, dagger: 1.1 },
  },
  archer: {
    name: 'Archer',
    emoji: '🏹',
    baseStats: { attack: 5, defense: 2, magic: 1, hp: 30 },
    growth: { attack: 2.5, defense: 1, magic: 0.5, hp: 5 },
    affinities: { bow: 1.5, knife: 1.25, dagger: 1.25 },
  },
  fireMage: {
    name: 'Fire mage',
    emoji: '🔥',
    baseStats: { attack: 1, defense: 1, magic: 6, hp: 25 },
    growth: { attack: 0.5, defense: 1, magic: 3, hp: 4 },
    affinities: { wand: 1.5 },
    resists: ['fire'],
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
