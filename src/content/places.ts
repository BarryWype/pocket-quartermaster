/**
 * Map places: temporary points of interest generated from geohash tiles.
 *
 * Coverage: precision 5 tiles are ~4.9 × 4.9 km, so a tile plus its 8
 * neighbours reach at least 4.9 km in every direction; precision 6 tiles are
 * ~1.2 × 0.6 km, so the neighbourhood covers at least 600 m — enough for the
 * 500 m at which fight events show. Density is per km², so a tile's spawn
 * count follows its real area (smaller at high latitudes). For random
 * placement the expected distance to the nearest place is 1/(2√density).
 */
export type PlaceKind =
  | 'tavern'
  | 'sawmill'
  | 'quarry'
  | 'copperMine'
  | 'ironMine'
  | 'coalPit'
  | 'huntingLodge'
  | 'smithy'
  | 'apothecary'
  | 'chapel'
  | 'market'
  | 'ruins'
  | 'library'
  | 'thievesGuild'
  | 'monsterLair'
  | 'fishingDock'
  | 'banditCamp'
  | 'goblinRaid'
  | 'beastDen'
  | 'hauntedCrypt'
  | 'elementalRift'
  | 'abandonedCaravan'
  | 'wantedOutlaw';

export type PlaceGroup = {
  id: string;
  /** Kind weights; for single-kind groups one entry with weight 1. */
  kinds: Partial<Record<PlaceKind, number>>;
  /** Expected places per km². */
  densityPerKm2: number;
  precision: number;
  /** How long a place stays before moving elsewhere. */
  windowHours: number;
  visibilityMeters: number;
};

const WINDOW_72H = { windowHours: 72, visibilityMeters: 1200 };

/** One kind per group, at the common destination density. */
const single = (kind: PlaceKind, densityPerKm2: number, precision = 5): PlaceGroup => ({
  id: kind,
  kinds: { [kind]: 1 } as Partial<Record<PlaceKind, number>>,
  densityPerKm2,
  precision,
  ...WINDOW_72H,
});

export const placeGroups: PlaceGroup[] = [
  single('tavern', 0.7),
  single('sawmill', 0.25),
  single('quarry', 0.25),
  single('copperMine', 0.25),
  single('ironMine', 0.25),
  single('coalPit', 0.25),
  single('huntingLodge', 0.25),
  single('smithy', 0.25),
  single('apothecary', 0.25),
  single('chapel', 0.25),
  single('market', 0.25),
  single('ruins', 0.5),
  single('library', 0.1),
  single('thievesGuild', 0.1),
  single('monsterLair', 0.1),
  single('fishingDock', 0.1),
  {
    id: 'fightEvents',
    kinds: {
      banditCamp: 1,
      goblinRaid: 1,
      beastDen: 1,
      hauntedCrypt: 1,
      elementalRift: 1,
      abandonedCaravan: 1,
      wantedOutlaw: 1,
    },
    densityPerKm2: 1.5,
    precision: 6,
    windowHours: 24,
    visibilityMeters: 500,
  },
];

export const placeRules = {
  interactionMeters: 50,
  /** Snapped to walkable places with coarse map tiles, like Sanctums. */
  placement: { mapZoom: 12, maxSnapMeters: 150 },
  /** Ore places double as mine tiers; a mine above the player's pickaxe tier shows less often. */
  mineTiers: { quarry: 1, copperMine: 2, ironMine: 3, coalPit: 4 } satisfies Partial<Record<PlaceKind, number>>,
  lockedMineShare: 0.5,
};
