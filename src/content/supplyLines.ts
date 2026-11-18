import type { BuildingKind } from '@/game/supply/types';
import type { PlaceGroup, PlaceKind } from '@/content/places';

/** The supply-lines trades a hero can carry (see doc/design/supply-lines/). */
export type TradeId = 'farmer' | 'herbalist' | 'woodcutter' | 'hunter' | 'miner' | 'teamster' | 'watchman';

export const TRADE_IDS: TradeId[] = ['farmer', 'herbalist', 'woodcutter', 'hunter', 'miner', 'teamster', 'watchman'];

export const tradeInfo: Record<TradeId, { name: string; emoji: string; description: string }> = {
  farmer: { name: 'Farmer', emoji: '🧑‍🌾', description: 'Raises a farm’s output.' },
  herbalist: { name: 'Herbalist', emoji: '🌿', description: 'Raises a herb garden’s output.' },
  woodcutter: { name: 'Woodcutter', emoji: '🪓', description: 'Raises a lumber camp’s and a charcoal kiln’s output.' },
  hunter: { name: 'Hunter', emoji: '🏹', description: 'Raises a hunting camp’s output.' },
  miner: { name: 'Miner', emoji: '⛏️', description: 'Raises a quarry’s and a mine’s output.' },
  teamster: { name: 'Teamster', emoji: '🐴', description: 'Drives the cart: more capacity and speed.' },
  watchman: { name: 'Watchman', emoji: '🏮', description: 'Posted at a building: raids are announced earlier, and fights there with a bonus.' },
};

export const supplyRules = {
  trade: {
    /** Hours of use to reach level 1, 2 and 3. */
    levelHours: [0, 40, 120],
  },
  /** The starting trio's fixed trades, so a new game and a migrated save agree. */
  startingTrades: { bram: 'herbalist', lyra: 'farmer', mira: 'teamster' } satisfies Record<string, TradeId>,

  /** The first chain's one-time reward, paid when its six steps are done (see game/supply/firstChain.ts). */
  firstChain: { rewardGold: 75 },

  /** The place kinds that hold orders; sites are built on. */
  discovery: { kinds: ['tavern', 'smithy', 'apothecary', 'market', 'site'] satisfies PlaceKind[] },

  /** The kinds whose places hold orders (a subset of the discovery kinds). */
  orders: {
    /** What each kind's order wants, as shares of the total; a market takes any network good, in any mix. */
    kinds: {
      tavern: { wants: { grain: 0.85, meat: 0.15 } },
      smithy: { wants: { stone: 1 } },
      apothecary: { wants: { herb: 0.62, berries: 0.38 } },
      market: { any: true },
    } as Record<OrderKind, { wants?: Record<string, number>; any?: boolean }>,
    /** An order is what one building of this star quality makes in `fillHours` at `rateShare` of its full rate. */
    averageQuality: 1.65,
    rateShare: 0.6,
    fillHours: 84,
    /** Each order varies from the middle by this much, seeded. */
    spread: 0.2,
    /** Gold per unit delivered, × the good's shop price; fractions build up and are paid as whole gold. */
    goldPerUnitShare: 1.25,
    /** The progress levels that pay a reward. */
    steps: [0.25, 0.5, 1],
    /** Gold rewards are multiplied by this, by tier 1–5. */
    tierGold: [1, 1, 1.5, 2, 3],
    rewards: {
      /** Gold at each step, before the tier multiplier; 0 marks a goods step. */
      gold: { tavern: [20, 0, 40], smithy: [20, 0, 40], apothecary: [20, 0, 40], market: [20, 30, 50] } as Record<OrderKind, [number, number, number]>,
      /** The smithy's 50% step: this many of the tier's ore. */
      ore: 6,
      /** The apothecary's 50% step: this many of the best healing potion the player can brew. */
      potions: 2,
      /** The tavern's 50% step: this many of one cookable meal. */
      meals: 2,
      /** The tavern's 50% step pays this many strong ale instead of the meals while the Ogre Chieftain's dungeon is open and he stands. */
      strongAle: 1,
    },
    /** The 100% headline pool per kind; a market draws from all three. */
    headlines: {
      tavern: ['banquetRoast', 'wayfarersFeast', 'stormbread'],
      apothecary: ['phoenixDraught', 'giantsDraught', 'sagesDraught'],
    },
    /** One apothecary order in five pays a Rare flask weapon instead of a potion. */
    flaskChance: 0.2,
    /** The day before the place leaves, one notification for a part-filled order. */
    noticeHours: 24,
  },

  /** Geohash precision of the supply grid (about 115–153 m cells; see the design doc). */
  cellPrecision: 7,
  /** Step along a segment when listing the cells it crosses. */
  cellStepMeters: 35,

  hall: {
    /** Moves of the hall allowed in any 7 days; the first placement doesn't count. */
    movesPerWeek: 2,
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
    /** Share of the full rate locals make with nobody posted; 0 means an empty building makes nothing. */
    localsShare: 0.6,
    /** Output bonus by trade level when the posted hero's trade matches the building. */
    tradeBonus: [0.25, 0.5, 1.0],
    /** Stock holds this many hours of full output (no bonus), then stops. */
    capHours: 24,
    /** Collecting inspects the building for this many hours. */
    inspectHours: 24,
    /** Output bonus while the building is inspected. */
    inspectBonus: 0.25,
    /** Collecting works within this many metres of the building. */
    collectMeters: 100,
  },

  /** The trade that raises each building kind's output (and earns its hours there). */
  matchingTrade: {
    farm: 'farmer',
    herbGarden: 'herbalist',
    lumberCamp: 'woodcutter',
    charcoalKiln: 'woodcutter',
    huntingCamp: 'hunter',
    quarry: 'miner',
    copperMine: 'miner',
    ironMine: 'miner',
  } satisfies Record<BuildingKind, TradeId>,

  sites: {
    /** Share of sites at quality 1, 2 and 3, drawn from the spawn's roll. */
    qualityShares: [0.5, 0.35, 0.15],
    /** A personal site appears only when no world site sits this close to the origin. */
    guaranteeMeters: 800,
    personal: {
      /** The personal site's distance band from the origin. */
      meters: [300, 700] as [number, number],
      /** Candidate spots tried before falling back to the first raw one. */
      tries: 6,
    },
  },

  buildings: {
    kinds: {
      farm: {
        /** Weights picking the material each made unit becomes. */
        makes: { grain: 85, meat: 15 },
        /** Units per hour per quality star at the full rate. */
        baseRate: 3.0,
        /** The place kind the farm mainly serves; null: its goods go home (and to markets). */
        for: 'tavern',
        /** The tier at which it can be built. */
        opensAtTier: 2,
      },
      herbGarden: { makes: { herb: 50, berries: 30, mushroom: 20 }, baseRate: 2.4, for: 'apothecary', opensAtTier: 2 },
      quarry: { makes: { stone: 100 }, baseRate: 2.4, for: 'smithy', opensAtTier: 2 },
      lumberCamp: { makes: { wood: 100 }, baseRate: 3.0, for: null, opensAtTier: 2 },
      /** The old trapper job's weights. */
      huntingCamp: { makes: { meat: 45, hide: 35, bone: 20 }, baseRate: 2.4, for: null, opensAtTier: 2 },
      /** Dearer ores come slower, so each building's gold per hour stays close. */
      copperMine: { makes: { copper: 100 }, baseRate: 1.8, for: null, opensAtTier: 3 },
      ironMine: { makes: { iron: 100 }, baseRate: 1.5, for: null, opensAtTier: 4 },
      charcoalKiln: { makes: { coal: 100 }, baseRate: 1.2, for: null, opensAtTier: 5 },
    } as Record<BuildingKind, { makes: Record<string, number>; baseRate: number; for: PlaceKind | null; opensAtTier: number }>,
    /** What a building costs to raise; the gold by tier 1–5. */
    cost: { goldByTier: [60, 60, 90, 140, 200], materials: [{ materialId: 'wood', amount: 10 }] },
    /** A building lasts this many days from when it was built. */
    lifeDays: 6,
    /** The last hours of its life warn that it is going. */
    lastDayHours: 24,
    /** How many buildings the player may hold at once, and how far from the hall they may stand, by tier. */
    limits: {
      1: { count: 3, meters: 1000 },
      2: { count: 3, meters: 1000 },
      3: { count: 4, meters: 1500 },
      4: { count: 5, meters: 2000 },
      5: { count: 6, meters: 2500 },
    } as Record<number, { count: number; meters: number }>,
  },

  cart: {
    /** The cart's speed in km/h with a driver. */
    speedKmh: 3,
    /** Share of the speed with nobody driving. */
    noDriverSpeed: 0.6,
    /** Units the cart carries. */
    capacity: 100,
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

  /** The street network the cart drives on (see game/supply/streets.ts). */
  streets: {
    /** Loose way ends within this many metres of another way are joined into one network. */
    joinMeters: 15,
    /** A stop further than this from any street gets a straight leg. */
    snapMeters: 200,
    /** Stored path points are simplified to about this resolution. */
    simplifyMeters: 5,
    /** The network covers this far beyond the hall's building reach. */
    extraReachMeters: 300,
  },

  danger: {
    /** The day's average danger samples the patrol day this many times (every 3 hours). */
    daySamples: 8,
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
    /** A building that lost a raid makes nothing for this many hours. */
    closedHours: 6,
    /** Heroes the player can send to defend a building, on top of the posted one. */
    maxDefenders: 3,
    /** Defenders walk from the hall to the building, and back, at this speed. */
    walkKmh: 4,
  },
};

/** The site group: empty ground to build on. Not in `placeGroups`, so nothing outside the network sees sites. */
export const siteGroup: PlaceGroup = {
  id: 'site',
  kinds: { site: 1 },
  densityPerKm2: 1.2,
  precision: 5,
  windowHours: 144,
  phases: 3,
  visibilityMeters: 1200,
};

/** The place kinds that hold orders. */
export type OrderKind = 'tavern' | 'smithy' | 'apothecary' | 'market';
export const ORDER_KINDS: OrderKind[] = ['tavern', 'smithy', 'apothecary', 'market'];

/** Every good the network's buildings make: what a market order takes. */
export const networkGoods: string[] = [
  ...new Set(Object.values(supplyRules.buildings.kinds).flatMap((kind) => Object.keys(kind.makes))),
];

/** The order kinds whose orders want the good (a market takes every network good). */
export const orderKindsWanting = (materialId: string): OrderKind[] =>
  ORDER_KINDS.filter((kind) => {
    const rule = supplyRules.orders.kinds[kind];
    return rule.any ? networkGoods.includes(materialId) : materialId in (rule.wants ?? {});
  });
