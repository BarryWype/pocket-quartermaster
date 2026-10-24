export const gatheringConfig = {
  collectRadiusMeters: 30,
  /** Animals flee from players moving faster than this (m/s). ~18 km/h, faster than a run. */
  animalFleeSpeed: 5,
  /** GPS readings less accurate than this are ignored (m). */
  maxAccuracyMeters: 40,
  /** Readings implying a faster move than this are treated as GPS jumps (m/s). */
  maxPlausibleSpeed: 45,
};

export type GatheringConfig = typeof gatheringConfig;
