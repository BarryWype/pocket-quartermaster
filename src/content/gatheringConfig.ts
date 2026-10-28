export const gatheringConfig = {
  collectRadiusMeters: 30,
  /** Animals flee from players moving faster than this (m/s). ~18 km/h, faster than a run. */
  animalFleeSpeed: 5,
  /** GPS readings less accurate than this are ignored (m). */
  maxAccuracyMeters: 40,
  /** Readings implying a faster move than this are treated as GPS jumps (m/s). */
  maxPlausibleSpeed: 45,
  /** The daily walking bonus: the first gathers each local day yield more. */
  walkingBonus: {
    /** Bonus gathers per local day (the tutorial's guaranteed wood doesn't count). */
    gathers: 15,
    /** Yield multiplier on a bonus gather, rounded up. */
    multiplier: 1.5,
  },
};

export type GatheringConfig = typeof gatheringConfig;
