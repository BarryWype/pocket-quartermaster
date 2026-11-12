import { difficultyRules } from '@/content/difficulty';

/**
 * Prepared minus the briefing skipped (the roster in natural gear), same
 * dungeons, at the tier's last probe: medium wants 10 points at tier 1 and 15
 * from tier 2, hard 25 at every tier; easy has none.
 */
export const threatGapTarget = (tier: number, difficulty: 'medium' | 'hard'): number =>
  difficulty === 'medium' ? (tier === 1 ? 0.1 : 0.15) : 0.25;

/**
 * The targets of doc/design/simulator/README.md, which the report puts next to
 * each result and the balance band tests check. Ranges are [min, max].
 */
export const targets = {
  /** Days from one tier boss's first win to the next ("about 7" reads 6–8, "about 14" 12–16). */
  daysPerTier: { casual: [12, 16], regular: [6, 8], heavy: [3, 4] } as Record<string, [number, number]>,
  odds: {
    /**
     * Normal expeditions per difficulty, prepared (the bot's real party, dressed
     * by suggestParty), at the tier's last probe (end) and, for easy, at the
     * last probe of its first day (start).
     */
    difficulty: difficultyRules.oddsTargets,
    /** The tier boss, prepared, at its first attempts: the probes on the day it first opens. */
    boss: [0.5, 0.6] as [number, number],
    /** Fight events and patrols, prepared. */
    events: [0.7, 0.8] as [number, number],
    /**
     * Tier 3, the elemental tier: the fitted party with no stone affixes and no
     * Warding or Spellweave tags, on each elemental dungeon, by difficulty;
     * Witch Marsh (one foe of six not elemental) has its own. With stones the
     * party should reach its difficulty's end target.
     */
    unprotected: {
      easy: [0.65, 0.75] as [number, number],
      medium: [0.35, 0.45] as [number, number],
      hard: [0.2, 0.3] as [number, number],
      witchMarsh: [0.5, 0.6] as [number, number],
    },
  },
  /** Weekly drops per category for the regular profile, at most this share off doc/design/loot/tools/pacing.py. */
  lootPacing: 0.2,
  /**
   * Looted gear (doc/design/loot/README.md): pieces a week for the regular
   * profile (pacing.py's Gear row: four gear slots), days between Rares by
   * profile, and Legendaries per tier for the regular profile.
   */
  gear: {
    piecesPerWeek: 36,
    daysPerRare: { regular: [2, 3], casual: [4, 5] } as Record<string, [number, number]>,
    legendariesPerTier: [0.5, 1.5] as [number, number],
  },
  /** Gold held may not grow over a tier by more than this many days of the tier's income. */
  goldSurplusDays: 3,
  /** The tier's main material: spent at least this share of what was gathered. */
  materialSpent: 0.75,
  /** The woodcutter's share of the wood spent per day, at every tier (doc/design/jobs/README.md's 10–15%). */
  woodcutterShare: [0.1, 0.15] as [number, number],
  /** A job gives at most this share of a material's walking intake (regular profile); walk first. */
  jobShareMax: 0.15,
  /** The gatherer gives at most this share of a material's walking intake (regular profile); it beats guild jobs because it depends on spawns. */
  gathererShareMax: 0.25,
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
  /**
   * Rotation: once the roster has `roster` heroes no class fills more than
   * `topClassShare` of party slots (regular profile), and from `fromTier` on
   * every complete week fields at least `heroesPerWeek` distinct heroes.
   */
  rotation: { roster: 8, topClassShare: 0.2, heroesPerWeek: 5, fromTier: 2 },
};

export type Targets = typeof targets;

/** Whether a value sits inside a target range. */
export const inRange = (value: number, [min, max]: [number, number]) => value >= min && value <= max;
