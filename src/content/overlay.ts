/** Overlay rules: how tall a sheet or dialog may grow, so its lower rows stay reachable. */

/**
 * A sheet never covers more than this share of the window height, and always
 * leaves this much room for the map above it (with the top safe-area inset).
 */
export const overlayRules = {
  /** The largest share of the window height a bottom sheet may take. */
  sheetMaxShare: 0.85,
  /** Kept free above a sheet so the map and its menus stay visible. */
  sheetTopMargin: 24,
};

/**
 * The tallest a bottom sheet may be, in pixels: the share of the window it may
 * take, and never past the top safe-area inset plus the margin above it.
 */
export function sheetMaxHeight(windowHeight: number, topInset: number): number {
  return Math.max(
    0,
    Math.min(
      Math.floor(windowHeight * overlayRules.sheetMaxShare),
      windowHeight - topInset - overlayRules.sheetTopMargin,
    ),
  );
}
