import type { TraitDef } from '@/game/types';

// Every hero has one personal trait. Effects use the ability system; the
// party-wide ones (gold, traps, locals, ambushes) count once per trait, however
// many heroes in the party have it, and different traits combine.
export const traits: TraitDef[] = [
  {
    id: 'resilient',
    name: 'Resilient',
    description: '+15% max HP.',
    positive: true,
    effects: [{ kind: 'statMultiplier', stat: 'hp', multiplier: 1.15 }],
  },
  {
    id: 'tough',
    name: 'Tough',
    description: '−10% damage taken.',
    positive: true,
    effects: [{ kind: 'damageTaken', multiplier: 0.9 }],
  },
  {
    id: 'quickHealer',
    name: 'Quick healer',
    description: 'Heals 50% faster at home; exhaustion lasts half as long.',
    positive: true,
    effects: [{ kind: 'healRate', multiplier: 1.5, exhaustion: 0.5 }],
  },
  {
    id: 'lightEater',
    name: 'Light eater',
    description: 'Needs one fewer supply point per expedition.',
    positive: true,
    effects: [{ kind: 'supplyNeed', add: -1 }],
  },
  {
    id: 'hardy',
    name: 'Hardy',
    description: 'Underfed and Starving penalties are halved for them.',
    positive: true,
    effects: [{ kind: 'hungerResist', multiplier: 0.5 }],
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
    description: 'Hunter’s stew heals them twice as much.',
    positive: true,
    effects: [{ kind: 'stewBoost', multiplier: 2 }],
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
  {
    id: 'frail',
    name: 'Frail',
    description: '−10% max HP.',
    positive: false,
    effects: [{ kind: 'statMultiplier', stat: 'hp', multiplier: 0.9 }],
  },
  {
    id: 'slowHealer',
    name: 'Slow healer',
    description: 'Heals 30% slower at home.',
    positive: false,
    effects: [{ kind: 'healRate', multiplier: 0.7, exhaustion: 1 }],
  },
  {
    id: 'glutton',
    name: 'Glutton',
    description: 'Needs one more supply point per expedition.',
    positive: false,
    effects: [{ kind: 'supplyNeed', add: 1 }],
  },
];

export const traitById = Object.fromEntries(traits.map((t) => [t.id, t]));
