export const navigationRules = {
  /** A navigation already in progress ignores further taps on it for this long (ms), so lag can't stack screens. */
  tapLockMs: 500,
  /** Safety timeout for the global pending lock: after a real push or back, every further navigate is ignored — any target — until the stack shows the new screen, or this long passes. */
  pendingMaxMs: 3000,
};
