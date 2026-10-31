/**
 * What the app preloads once the map is shown (issue 17): the images the
 * Expeditions screen and the forge draw are decoded ahead of their first draw,
 * and the Expeditions route module is evaluated ahead of its first opening —
 * both cold costs the first visit otherwise pays.
 */
export const preloadRules = {
  /** Preloading starts this long after the map is shown, in ms — off the first frames. */
  delayMs: 2000,
};
