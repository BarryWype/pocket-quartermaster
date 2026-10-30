import type { SecretKind } from './places';

/** The places and runs that can tip the player off about a secret place, each always the same one. */
export type PlaceTipSource = 'library' | 'traveller' | 'heist' | 'banditCamp' | 'fishingDock' | 'monsterLair';

/** Every tip source: the secret quest tips off whichever place has no tip yet. */
export type TipSource = PlaceTipSource | 'quest';

/**
 * Secret places: a tip puts one on the player's map, entering uses up a
 * mysterious key. The numbers are placeholders: tune later.
 */
export const secretRules = {
  /** What each source tips off, and how often: per library window, helped traveller, successful heist, won camp or lair, catch. */
  tips: {
    library: { secret: 'hiddenDen', chance: 0.3 },
    traveller: { secret: 'hiddenDen', chance: 0.15 },
    heist: { secret: 'blackMarket', chance: 0.2 },
    banditCamp: { secret: 'blackMarket', chance: 0.1 },
    fishingDock: { secret: 'underwaterDungeon', chance: 0.1 },
    monsterLair: { secret: 'underwaterDungeon', chance: 0.25 },
  } satisfies Record<PlaceTipSource, { secret: SecretKind; chance: number }>,
  /** The marker sits this far from where the tip was found. */
  distanceMeters: [500, 1500] as [min: number, max: number],
  /** A secret quest's tip sits closer to the strange mark. */
  questDistanceMeters: [300, 1000] as [min: number, max: number],
  /** A tipped place stays this long, like other places. */
  lifetimeHours: 72,
  /** Seeded spots tried for the underwater dungeon; the map shows the first one near water. */
  waterSpots: 8,
  /** A tip for a place already tipped pays this much gold instead, by highest unlocked tier. */
  duplicateGold: [10, 20, 35, 60, 100],
  /** The library's old ledger, by highest unlocked tier. */
  ledgerPrice: [40, 80, 150, 280, 500],
  blackMarket: {
    /** Goods on sale besides the recruit. */
    lines: [2, 3] as [min: number, max: number],
    /** What the goods are drawn from, evenly. */
    goods: ['components', 'trinkets'] as ('components' | 'trinkets')[],
    /** Price: a component's sell price, or the shop gear price for its tier and quality, times this. */
    markup: 3,
  },
  /** The underwater dungeon's and the Sealed vault's prize: a relic, else a Rare piece of gear (sometimes Legendary). */
  prize: { relicChance: 0.25, legendaryChance: 0.05 },
  /** The Underwater threat's level in the underwater dungeon, by tier. */
  underwaterLevelByTier: [1, 1, 2, 2, 3] as (1 | 2 | 3)[],
};

