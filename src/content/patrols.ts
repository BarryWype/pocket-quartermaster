import type { PatrolKind, TravellerKind } from '@/game/patrols/generate';

/** Recommended fight setup for one kind of patrol; what a win pays is its loot matrix row. */
export type PatrolKindRules = {
  /** The party size its odds are tuned for. */
  party: number;
  /** Minutes the fight takes. */
  fightMinutes: number;
  /** Fight groups before the boss, as patrol mob roles (see enemies.ts). */
  groups: { role: 'weak' | 'normal'; count: number; weight: number }[];
};

export const patrolKinds: Record<PatrolKind, PatrolKindRules> = {
  goblins: {
    party: 1,
    fightMinutes: 2,
    groups: [
      { role: 'weak', count: 1, weight: 2 },
      { role: 'normal', count: 1, weight: 1 },
    ],
  },
  herd: {
    party: 1,
    fightMinutes: 2,
    groups: [
      { role: 'weak', count: 2, weight: 2 },
      { role: 'normal', count: 1, weight: 1 },
    ],
  },
  bandits: {
    party: 2,
    fightMinutes: 5,
    groups: [
      { role: 'weak', count: 2, weight: 2 },
      { role: 'normal', count: 1, weight: 2 },
    ],
  },
};

/** How patrols and travellers roam the map, and what meeting them is worth. */
export const patrolRules = {
  /** Geohash precision of the tiles they roam in (≈ 1.2 × 0.6 km). */
  precision: 6,
  /** Everything rerolls when a window ends. */
  windowMinutes: 30,
  /** Spawns per tile per window: weights for 0, 1 and 2 (average 1). */
  patrolCountWeights: [0.3, 0.4, 0.3],
  /** One traveller per about this many spawns. */
  travellerEvery: 5,
  /** Patrol kinds by weight; travellers pick their own kinds. */
  kindWeights: { goblins: 0.45, herd: 0.35, bandits: 0.2 } satisfies Record<PatrolKind, number>,
  /** Each spawn wanders at a speed rolled in this range (km/h). */
  speedKmh: [1, 2] as [min: number, max: number],
  /** Waypoints its loop runs through. */
  waypoints: 3,
  /** Seen on the map from this far (m). */
  visibleMeters: 300,
  /** Fought or helped from this far (m). */
  engageMeters: 80,
  /** Goblins move on this long after first being seen. */
  goblinFleeMinutes: 10,
  /** The tier a patrol fights at, relative to the highest unlocked. */
  tierWeights: { current: 0.6, below: 0.3, elite: 0.1 },
  /** What the background task's escort hero may take on by itself. */
  escort: { types: ['goblins', 'herd'] as PatrolKind[], minOdds: 0.7, minHpShare: 0.5, oddsRuns: 60 },
  /** Patrol alerts: one per patrol, none closer together than this. */
  alerts: { cooldownMinutes: 5 },
  /** Chance a traveller offers to join the roster when helped. */
  recruitChance: 0.05,
  /** Travellers only offer to join a roster this big, so they never speed up the early recruits. */
  recruitMinRoster: 6,
  /** Applied background results are remembered this long, then pruned. */
  appliedResultDays: 2,
};

export type PatrolRules = typeof patrolRules;

/** What travellers ask for, and what they give back. */
export const travellerRules = {
  /** Traveller kinds by weight. */
  kinds: { wounded: 0.4, pilgrim: 0.35, trader: 0.25 } satisfies Record<TravellerKind, number>,
  /** Gold the pilgrim opportunity in a dungeon hands over, as a share of the tier's short-dungeon average. */
  goldShareOfShort: 1,
  /** The pilgrim takes a meal, or this many supply points instead. */
  pilgrimSupplyPoints: 3,
  /** A helped pilgrim also blesses the heroes at home this often (the loot is the Traveller row of the matrix). */
  pilgrimBlessingChance: 0.45,
  /** The pilgrim opportunity in a dungeon: what the pilgrim gives back, by weight. */
  pilgrimRewards: [
    { kind: 'blessing', weight: 2 },
    { kind: 'gold', weight: 2 },
    { kind: 'keyFragment', weight: 0.5 },
  ] as const,
  /** Fixed trades a trader picks from; ore and ingots above the player's pickaxe tier are left out. */
  trades: [
    { give: { materialId: 'bone', amount: 6 }, get: { materialId: 'iron', amount: 1 }, pickaxeTier: 3 },
    { give: { materialId: 'mushroom', amount: 6 }, get: { materialId: 'coal', amount: 1 }, pickaxeTier: 4 },
    { give: { materialId: 'hide', amount: 4 }, get: { materialId: 'copper', amount: 1 }, pickaxeTier: 2 },
    { give: { materialId: 'wood', amount: 5 }, get: { materialId: 'herb', amount: 2 }, pickaxeTier: 0 },
    { give: { materialId: 'berries', amount: 6 }, get: { materialId: 'mushroom', amount: 3 }, pickaxeTier: 0 },
    { give: { materialId: 'meat', amount: 3 }, get: { materialId: 'hide', amount: 2 }, pickaxeTier: 0 },
  ],
  /** How many trades one trader offers. */
  tradesPer: [2, 3] as [min: number, max: number],
  /** Times each trade can be used while the trader's window lasts. */
  usesPerTrade: 3,
};

export type TravellerRules = typeof travellerRules;

/** English wording; the French is in content/fr/patrols.ts. */
export const patrolTexts = {
  kinds: { goblins: 'Goblin patrol', herd: 'Wild herd', bandits: 'Bandits' } satisfies Record<PatrolKind, string>,
  travellers: {
    wounded: { name: 'Wounded traveller', line: 'Hurt and far from the road — a healing potion would help.' },
    pilgrim: { name: 'Pilgrim', line: 'A long road on an empty pack. A meal would be a kindness.' },
    trader: { name: 'Trader', line: 'A trader with a heavy pack, open to a deal.' },
  } satisfies Record<TravellerKind, { name: string; line: string }>,
  keyFragment: {
    name: 'Key fragment',
    description: 'A piece of something. Maybe more will fit together.',
  },
};
