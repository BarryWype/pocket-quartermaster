import type { DungeonModifier } from '@/game/types';

// Daily twists: about 60% of days, one dungeon per tier gets one whose
// required tags it has. They only change data (weights, element, rewards).
export const dungeonModifiers: DungeonModifier[] = [
  {
    id: 'restlessDead',
    name: 'Restless dead',
    emoji: '🕯️',
    description: 'More undead fights.',
    requires: ['undead'],
    boost: { tag: 'undead', multiplier: 2 },
  },
  {
    id: 'flooded',
    name: 'Flooded',
    emoji: '🌊',
    description: 'Every enemy deals water damage.',
    requires: [],
    enemyElement: 'water',
  },
  {
    id: 'boobyTrapped',
    name: 'Booby-trapped',
    emoji: '🪤',
    description: 'More traps.',
    requires: ['trap'],
    boost: { tag: 'trap', multiplier: 2.5 },
  },
  {
    id: 'richVeins',
    name: 'Rich veins',
    emoji: '⛏️',
    description: '+30% materials.',
    requires: [],
    materials: 1.3,
  },
  {
    id: 'bounty',
    name: 'Bounty',
    emoji: '💰',
    description: '+30% gold.',
    requires: [],
    gold: 1.3,
  },
  {
    id: 'packHunt',
    name: 'Pack hunt',
    emoji: '🐾',
    description: 'More beast fights.',
    requires: ['beast'],
    boost: { tag: 'beast', multiplier: 2 },
  },
];

export const modifierById = Object.fromEntries(dungeonModifiers.map((m) => [m.id, m]));
