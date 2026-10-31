/**
 * How the odds estimates are computed off the first frame: the same simulated
 * runs as `estimatePartyOdds`, but in slices small enough that the JS thread
 * stays responsive between them (issue 17).
 */
export const oddsRules = {
  /**
   * Simulated runs per slice. Sized to stay under roughly 8 ms on a phone, so
   * a slice loop yields between slices and taps land within a frame or two.
   */
  runsPerSlice: 20,
  /** The warm-up (see services/oddsWarmup.ts) starts this long after the map shows, in ms. */
  warmupStartDelayMs: 5000,
  /** After a player interaction, the warm-up waits this long before resuming, in ms. */
  warmupResumeDelayMs: 2000,
};
