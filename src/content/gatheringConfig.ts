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
  /** Auto-gather: regular nodes collected along the path walked, phone in the pocket. */
  autoGather: {
    /** A node is collected when the path passes this close; smaller than the tap range. */
    radiusMeters: 20,
    /** Fixes less accurate than this are ignored (m). */
    maxAccuracyMeters: 25,
    /** Segments faster than a run are ignored (m/s, ~15 km/h). */
    maxSpeed: 4.2,
    /** Segments longer than this are GPS jumps (m). */
    maxSegmentMeters: 300,
    /** Fixes further apart in time start a new path instead of joining up (s). */
    maxSegmentSeconds: 300,
    /** The path is checked in pieces this long, so nodes come from the tiles along it (m). */
    sampleMeters: 50,
    /** Animals move, so their closest approach is checked every this many metres of path. */
    animalStepMeters: 5,
    /** Steps estimated from distance where the pedometer can't count (Android in the background). */
    strideMeters: 0.75,
    /** Tracking stops after this long without movement (minutes); players pick one of `autoStopChoices`. */
    autoStopMinutes: 30,
    autoStopChoices: [15, 30, 60],
    /** The background buffer keeps at most this many fixes, and none older than `bufferHours`. */
    bufferMaxFixes: 2000,
    bufferHours: 12,
    /** A fix this close to the last one kept is not stored (the player is standing still) (m). */
    minMoveMeters: 10,
    /** Walk summaries kept in the history. */
    historySize: 5,
    /** Hours a walk waits for map tiles that failed to load before it is processed without them. */
    tileRetryHours: 6,
    /** Background location updates. */
    tracking: {
      /** Android: a fix this often, also while standing still, so auto-stop can tell (ms). */
      androidTimeIntervalMs: 15_000,
      /** iOS: a fix every this many metres; iOS pauses updates itself when the player stops. */
      iosDistanceIntervalMeters: 12,
    },
  },
  /** Walking consumables: minutes each lasts and what it does. */
  walkEffects: {
    forage: { minutes: 30, radiusBonusMeters: 10 },
    musk: { minutes: 15, animals: 3, radiusMeters: 200 },
    prospect: { minutes: 30, oreBonus: 1 },
    track: { minutes: 30, rangeMultiplier: 2 },
  },
};

export type GatheringConfig = typeof gatheringConfig;
