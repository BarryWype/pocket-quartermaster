import type { PlaceKind } from './places';

export type QuestBand = 'short' | 'medium' | 'long';
export type QuestObjective =
  | 'chapel' | 'library' | 'ruins' | 'dock'        // Visit
  | 'fightEvent' | 'patrols' | 'lair'              // Fight
  | 'deliver'                                      // Deliver
  | 'mine' | 'gatherOnWay'                         // Gather
  | 'collector'                                    // Trade
  | 'walk';                                        // Walk

export const questRules = {
  /** New quests each rotation day, inclusive range. */
  arrivalsPerDay: [2, 3] as [number, number],
  /** Regular quests held at once (the secret quest doesn't count). */
  cap: 6,
  lifetimeHours: 48,
  rerollsPerDay: 1,
  bandWeights: { short: 48, medium: 36, long: 16 } as Record<QuestBand, number>,
  /** Straight-line distance from where the target was fixed: (min, max]. Short includes 0. */
  bandMeters: { short: [0, 500], medium: [500, 1000], long: [1000, 2000] } as Record<QuestBand, [number, number]>,
  /** N by band for the objectives with an amount; others are 1. Walk is metres. */
  amounts: {
    patrols: { short: 1, medium: 2, long: 3 },
    gatherOnWay: { short: 4, medium: 8, long: 15 },
    mine: { short: 3, medium: 5, long: 8 },
    deliver: { short: 1, medium: 2, long: 3 },
    walk: { short: 500, medium: 1000, long: 2000 },
  } as Partial<Record<QuestObjective, Record<QuestBand, number>>>,
  /** Herbs, berries and mushrooms count for "gather on the way". */
  gatherOnWayMaterials: ['herb', 'berries', 'mushroom'],
  /** Rewards read the Luck of this many of the luckiest heroes, like a party's. */
  luckHeroes: 3,
  secret: {
    /** Completions within the window that pop the day's secret quest. */
    completions: 4,
    windowHours: 5,
    /** The strange mark sits this far from where it was fixed. */
    markMeters: [300, 500] as [number, number],
    lifetimeHours: 48,
  },
};

export type ObjectiveDef = {
  kind: 'visit' | 'fight' | 'deliver' | 'gather' | 'trade' | 'walk';
  emoji: string;
  /** Place kinds a target can be; none for objectives without a place. */
  places?: PlaceKind[];
  weight: number;
  /** Bands it can roll in (lair: long only). Omitted = all. */
  bands?: QuestBand[];
};

export const objectives: Record<QuestObjective, ObjectiveDef> = {
  chapel: { kind: 'visit', emoji: '⛪', places: ['chapel'], weight: 1 },
  library: { kind: 'visit', emoji: '📜', places: ['library'], weight: 1 },
  ruins: { kind: 'visit', emoji: '🏛️', places: ['ruins'], weight: 1 },
  dock: { kind: 'visit', emoji: '🎣', places: ['fishingDock'], weight: 1 },
  fightEvent: {
    kind: 'fight',
    emoji: '⚔️',
    places: ['banditCamp', 'goblinRaid', 'beastDen', 'hauntedCrypt', 'elementalRift', 'abandonedCaravan', 'wantedOutlaw'],
    weight: 1,
  },
  patrols: { kind: 'fight', emoji: '🛡️', weight: 1 },
  lair: { kind: 'fight', emoji: '🐉', places: ['monsterLair'], weight: 1, bands: ['long'] },
  deliver: { kind: 'deliver', emoji: '📦', weight: 1 },
  mine: { kind: 'gather', emoji: '⛏️', weight: 1 },
  gatherOnWay: { kind: 'gather', emoji: '🌿', weight: 1 },
  collector: { kind: 'trade', emoji: '💰', places: ['market'], weight: 1 },
  walk: { kind: 'walk', emoji: '🥾', weight: 1 },
};

/** Where each crafted item group is wanted (see deliverItems). */
export const deliverPlaces = { potion: 'apothecary', meal: 'tavern', kit: 'chapel' } as Record<
  'potion' | 'meal' | 'kit',
  PlaceKind
>;
