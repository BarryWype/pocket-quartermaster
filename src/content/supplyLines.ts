import type { Camp } from '@/game/supply/types';

/** The supply-lines trades a hero can carry (see doc/design/supply-lines/). */
export type TradeId = 'woodcutter' | 'trapper' | 'teamster' | 'watchman';

export const TRADE_IDS: TradeId[] = ['woodcutter', 'trapper', 'teamster', 'watchman'];

export const tradeInfo: Record<TradeId, { name: string; emoji: string; description: string }> = {
  woodcutter: { name: 'Woodcutter', emoji: '🪓', description: 'Raises a timber camp’s output.' },
  trapper: { name: 'Trapper', emoji: '🪤', description: 'Raises a trapper’s camp’s output.' },
  teamster: { name: 'Teamster', emoji: '🐴', description: 'Drives the cart: more capacity and speed.' },
  watchman: { name: 'Watchman', emoji: '🏮', description: 'Posted at a camp: raids are announced earlier, and fights there with a bonus.' },
};

export const supplyRules = {
  trade: {
    /** Hours of use to reach level 1, 2 and 3. */
    levelHours: [0, 40, 120],
  },
  /** The starting trio's fixed trades, so a new game and a migrated save agree. */
  startingTrades: { bram: 'woodcutter', lyra: 'trapper', mira: 'teamster' } satisfies Record<string, TradeId>,

  /** Geohash precision of the supply grid (about 115–153 m cells; see the design doc). */
  cellPrecision: 7,
  /** Step along a segment when listing the cells it crosses. */
  cellStepMeters: 35,

  hall: {
    /** Moves of the hall allowed in any 7 days; the first placement doesn't count. */
    movesPerWeek: 2,
  },

  camps: {
    /** A camp must sit within this many metres of the hall. */
    maxHallMeters: 2000,
  },

  terrain: {
    /** Sample points per side of the grid a cell is classified on. */
    samplesPerSide: 4,
    /** Share of sample points in green that makes a cell green. */
    greenShare: 0.25,
    /** How close to a water edge still counts as waterside. */
    waterEdgeMeters: 50,
  },

  production: {
    /** Units per hour per quality star at the full rate; well above the guild jobs' 0.3. */
    baseRate: { timber: 1.0, trapper: 0.8 },
    /** Share of the full rate locals make with nobody posted; 0 means an empty camp makes nothing. */
    localsShare: 0.4,
    /** Output bonus by trade level when the posted hero's trade matches the camp. */
    tradeBonus: [0.25, 0.5, 1.0],
    /** Stock holds this many hours of full output (no bonus), then stops. */
    capHours: 12,
    /** Collecting inspects the camp for this many hours. */
    inspectHours: 24,
    /** Output bonus while the camp is inspected. */
    inspectBonus: 0.25,
    /** Collecting works within this many metres of the camp cell's centre. */
    collectMeters: 100,
  },
  /** The trade that raises each camp kind's output (and earns its hours there). */
  matchingTrade: { timber: 'woodcutter', trapper: 'trapper' } satisfies Record<Camp['kind'], TradeId>,

  cart: {
    /** The cart's speed in km/h with a driver. */
    speedKmh: 3,
    /** Share of the speed with nobody driving. */
    noDriverSpeed: 0.6,
    /** Units the cart carries. */
    capacity: 20,
    /** Escorts allowed beside the driver. */
    maxEscorts: 2,
    teamster: {
      /** Speed bonus by Teamster trade level. */
      speed: [0.15, 0.3, 0.5],
      /** Capacity bonus by Teamster trade level. */
      capacity: [0.25, 0.5, 1.0],
    },
    /** Minutes an empty cart takes to come home after a lost ambush. */
    lostReturnMinutes: 30,
    /** A crew member under this share of max HP parks the cart at home. */
    minCrewHpShare: 0.5,
    /** Loops kept in the cart's log. */
    logSize: 10,
  },

  danger: {
    /** A patrol counts for a cell when its track comes this close to the cell's centre. */
    patrolMeters: 150,
    /** Fight events within this many metres of the cell's centre add to its score. */
    eventMeters: 300,
    /** Live lairs within this many metres of the cell's centre add to its score. */
    lairMeters: 500,
    /** What a live lair adds to a cell's score. */
    lairWeight: 3,
    /** Score weight per difficulty; a boss counts as hard. */
    weights: { easy: 1, medium: 2, hard: 3 },
    /** The score at which levels 1, 2 and 3 start. */
    levelFrom: [1, 3, 5],
    /** Chance a crossing ambushes, per danger level 0–3. */
    ambushChance: [0, 0.02, 0.05, 0.1],
    /** Minutes between the track points a patrol's reach is sampled on. */
    trackStepMinutes: 2,
  },

  raids: {
    /** Chance, rolled once on each day the app is opened, that a raid lands that day. */
    dailyChance: 0.5,
    /** Hours between a raid's announcement and its landing. */
    announceHours: 2,
    /** The lead instead, by trade level, while a Watchman is posted at the target. */
    watchmanAnnounceHours: [4, 5, 6],
    /** An absence this long or longer counts as away: no raid is announced right after it. */
    awayDays: 2,
    /** After such an absence, nothing is announced for this many hours. */
    returnQuietHours: 2,
    /** A camp that lost a raid makes nothing for this many hours. */
    closedHours: 6,
    /** Heroes the player can send to defend a camp, on top of the posted one. */
    maxDefenders: 3,
    /** Defenders walk from the hall to the camp, and back, at this speed. */
    walkKmh: 4,
  },
};
