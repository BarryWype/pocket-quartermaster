/** How often each kind of on-screen time refreshes. Every clock stops while its screen isn't focused. */
export const clockConfig = {
  /** Player position on the map: GPS fixes closer together than this are dropped. */
  gpsMinMs: 2000,
  /** Patrol markers and animals moving, map only. */
  mapMovingMs: 5000,
  /** A countdown in its last minute, shown in seconds. */
  secondsMs: 1000,
  /** Below this, countdowns show seconds. */
  secondsBelowMs: 60_000,
  /** Countdowns over a minute, HP bars healing, screens whose logic depends on time. */
  minutesMs: 10_000,
  /** New resources and places appearing, map only. */
  spawnsMs: 30_000,
  /** Rotation day, ambience. */
  dayMs: 60_000,
};
