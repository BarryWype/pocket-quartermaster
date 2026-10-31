export const navigationRules = {
  /** A second tap on the same screen within this long (ms) is ignored, so lag can't stack screens. */
  tapLockMs: 500,
  /**
   * A pushed screen waits this long (ms) for the push transition to end before
   * it starts its heavy work anyway; covers platforms and settings that show
   * no transition at all (see Expeditions' odds effect).
   */
  transitionFallbackMs: 600,
};
