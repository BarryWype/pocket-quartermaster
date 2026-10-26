import type { SanctumDef } from '@/game/types';

export const sanctums: SanctumDef[] = [
  {
    id: 'overgrownLabyrinth',
    name: 'Overgrown Labyrinth',
    element: 'grass',
    emoji: '🌿',
    description: 'Hedges taller than houses fold into a maze that rearranges itself every night.',
    guardian: {
      name: 'Thornmother',
      description: 'An ancient tangle of briars that grows a new thorn for every intruder.',
      effect: 'sweep',
    },
    minions: ['briar hound', 'vine lasher'],
  },
  {
    id: 'sunkenGrotto',
    name: 'Sunken Grotto',
    element: 'water',
    emoji: '💧',
    description: 'A flooded cave where the tide never quite goes out, and the walls hum at night.',
    guardian: {
      name: 'Tidewarden',
      description: 'A coral-armoured sentinel that drags anyone who disturbs the grotto beneath the waves.',
      effect: 'enrage',
    },
    minions: ['cave crab', 'drowned eel'],
  },
  {
    id: 'stormSpire',
    name: 'Storm Spire',
    element: 'electric',
    emoji: '⚡',
    description: 'A crooked iron tower that lightning strikes on the hour, every hour.',
    guardian: {
      name: 'Voltwing',
      description: 'A great hawk whose feathers crackle with every storm it has ever swallowed.',
      effect: 'sweep',
    },
    minions: ['spark sprite', 'storm hound'],
  },
  {
    id: 'deepQuarry',
    name: 'Deep Quarry',
    element: 'stone',
    emoji: '🪨',
    description: 'An abandoned quarry that keeps getting deeper, though nobody has dug there in years.',
    guardian: {
      name: 'Granite Colossus',
      description: 'A walking cliff face: slow to anger, and nearly impossible to crack.',
      effect: 'enrage',
    },
    minions: ['pebble golem', 'quarry mole'],
  },
  {
    id: 'emberForge',
    name: 'Ember Forge',
    element: 'fire',
    emoji: '🔥',
    description: 'A forsaken smithy whose furnace has burned for a hundred years without fuel.',
    guardian: {
      name: 'Cinder Smith',
      description: "The forge's last master, now more flame than man, still hammering at something nobody can see.",
      effect: 'enrage',
    },
    minions: ['ember imp', 'slag hound'],
  },
];

export const sanctumRules = {
  /** Geohash precision 5 ≈ 4.9 × 4.9 km; a tile and its neighbours are generated around the player. */
  precision: 5,
  windowMinutes: 24 * 60,
  /** How many of each Sanctum a tile holds. */
  perTile: [1, 1] as [min: number, max: number],
  /** Shown from this far, so a Sanctum can set the goal of a walk. */
  visibilityMeters: 4500,
  interactionMeters: 50,
  /**
   * Snapped to walkable places with coarse map tiles: a zoom 12 tile spans
   * ~6–8 km for 0.1–0.35 MB, against 1.6–1.9 km for up to 1 MB at zoom 14.
   */
  placement: { mapZoom: 12, maxSnapMeters: 150 },
  /** Encounters, guardian included: one or two minion fights, then the guardian. */
  encounterCount: [2, 3] as [min: number, max: number],
  /**
   * Guardian difficulty by Sigil tier (index 0 = tier 1), as a multiplier on
   * the base stats below. Tuned so a full tier N kit with potions wins ~65%.
   */
  tierStrength: [2.21, 1.96, 1.85, 1.88, 1.93],
  minionBase: { weak: { hp: 10, damage: 4 }, strong: { hp: 16, damage: 5 } },
  guardianBase: { hp: 110, damage: 9 },
  /** Shards or stones of the Sanctum's element, by Sigil tier. */
  rewards: [
    { win: { shards: 3, stones: 0 }, loss: { shards: 1, stones: 0 } },
    { win: { shards: 5, stones: 0 }, loss: { shards: 2, stones: 0 } },
    { win: { shards: 7, stones: 0 }, loss: { shards: 3, stones: 0 } },
    { win: { shards: 0, stones: 1 }, loss: { shards: 4, stones: 0 } },
    { win: { shards: 3, stones: 1 }, loss: { shards: 5, stones: 0 } },
  ],
};
