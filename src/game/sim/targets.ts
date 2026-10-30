/**
 * The targets of doc/design/simulator/README.md, which the report puts next to
 * each result and the balance band tests check. Ranges are [min, max].
 */
export const targets = {
  /** Days from one tier boss's first win to the next ("about 7" reads 6–8, "about 14" 12–16). */
  daysPerTier: { casual: [12, 16], regular: [6, 8], heavy: [3, 4] } as Record<string, [number, number]>,
  odds: {
    /** Normal expeditions with the right kits and the tier's gear. */
    prepared: [0.65, 0.75] as [number, number],
    /** Not prepared: the briefing skipped — the strongest party picked as if there were no threats, with no kits. */
    unprepared: [0.3, 0.45] as [number, number],
    boss: [0.5, 0.6] as [number, number],
    /** Fight events and patrols, prepared. */
    events: [0.7, 0.8] as [number, number],
  },
  /** Weekly drops per category for the regular profile, at most this share off doc/design/loot/tools/pacing.py. */
  lootPacing: 0.2,
  /** Gold held may not grow over a tier by more than this many days of the tier's income. */
  goldSurplusDays: 3,
  /** The tier's main material: spent at least this share of what was gathered. */
  materialSpent: 0.75,
  /** Heroes end each tier within this many levels of the top of its band (expectedLevels). */
  levelSlack: 1,
  /** A stock that grows at every tier end and ends above this is a pile-up. */
  pileUp: 20,
  /** Traders are traded with while more than this much of the material is held. */
  unusedStockpile: 20,
  /**
   * Rotating the roster must earn at least this many times the XP and gold per
   * hour of sending the same 3 heroes to the shortest tier 1 dungeon over and over.
   */
  spamAdvantage: 1.2,
};

export type Targets = typeof targets;

/** Whether a value sits inside a target range. */
export const inRange = (value: number, [min, max]: [number, number]) => value >= min && value <= max;
