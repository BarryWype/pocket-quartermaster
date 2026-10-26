import type { TraitDef } from '@/game/types';

// Every hero has one personal trait. Effects use the ability system; the
// party-wide ones (gold, traps, locals, ambushes) count once per trait, however
// many heroes in the party have it, and different traits combine.
export const traits: TraitDef[] = [
  {
    id: 'tough',
    name: 'Tough',
    description: '+15% HP.',
    positive: true,
    effects: [{ kind: 'statMultiplier', stat: 'hp', multiplier: 1.15 }],
  },
  {
    id: 'thrifty',
    name: 'Thrifty',
    description: '+10% gold from their expeditions.',
    positive: true,
    effects: [{ kind: 'goldMultiplier', multiplier: 1.1 }],
  },
  {
    id: 'lucky',
    name: 'Lucky',
    description: '+8% critical hit chance.',
    positive: true,
    effects: [{ kind: 'critBonus', chance: 0.08 }],
  },
  {
    id: 'quickLearner',
    name: 'Quick learner',
    description: '+20% XP.',
    positive: true,
    effects: [{ kind: 'xpMultiplier', multiplier: 1.2 }],
  },
  {
    id: 'lightSleeper',
    name: 'Light sleeper',
    description: 'Ambushes don’t get the first strike.',
    positive: true,
    effects: [{ kind: 'ambushAlert' }],
  },
  {
    id: 'ironStomach',
    name: 'Iron stomach',
    description: 'Rations heal twice as much.',
    positive: true,
    effects: [{ kind: 'rationBoost', multiplier: 2 }],
  },
  {
    id: 'clumsy',
    name: 'Clumsy',
    description: 'Traps trigger more often.',
    positive: false,
    effects: [{ kind: 'trapTrigger', multiplier: 1.4 }],
  },
  {
    id: 'greedy',
    name: 'Greedy',
    description: '−10% gold from their expeditions.',
    positive: false,
    effects: [{ kind: 'goldMultiplier', multiplier: 0.9 }],
  },
  {
    id: 'coward',
    name: 'Coward',
    description: 'Drinks their potion early, below 60% HP.',
    positive: false,
    effects: [{ kind: 'potionThreshold', add: 0.25 }],
  },
  {
    id: 'loud',
    name: 'Loud',
    description: 'Locals are more likely to turn on the party.',
    positive: false,
    effects: [{ kind: 'hostileLocals', chance: 0.3, noticeBonus: 0.2 }],
  },
];

export const traitById = Object.fromEntries(traits.map((t) => [t.id, t]));
