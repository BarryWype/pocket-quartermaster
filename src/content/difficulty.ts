/** The difficulty a dungeon, patrol or fight event is tuned to. */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'boss';

/** One source of truth for the difficulty bands; everything else reads from here. */
export const difficultyRules = {
  /** Display and progression order. */
  order: ['easy', 'medium', 'hard', 'boss'] as Difficulty[],
  /**
   * Win-odds targets of normal expeditions, prepared (the bot's real party,
   * dressed by suggestParty): [min, max] at the tier's start and end. The fit
   * (sim:fit) and the simulator's report both measure against them.
   */
  oddsTargets: {
    easy: { start: [0.55, 0.65], end: [0.85, 0.9] },
    medium: { start: [0.25, 0.4], end: [0.65, 0.75] },
    hard: { start: [0.05, 0.15], end: [0.5, 0.6] },
  } satisfies Record<Exclude<Difficulty, 'boss'>, { start: [number, number]; end: [number, number] }>,
  /** Threat level by difficulty, before and from tier 3 (`threatLevelFromTier`); capped at 3. */
  threatLevel: {
    easy: [1, 1],
    medium: [1, 2],
    hard: [2, 3],
    boss: null, // unchanged
  } satisfies Record<Exclude<Difficulty, 'boss'>, [beforeTier3: number, fromTier3: number]> & { boss: null },
  /** The tier from which `threatLevel`'s second entry applies. */
  threatLevelFromTier: 3,
  /** Party size for patrols by difficulty. */
  patrolParty: { easy: 1, medium: 2, hard: 3 } satisfies Record<Exclude<Difficulty, 'boss'>, number>,
  /** Patrol spawns by difficulty; the two kinds of a difficulty split it evenly. */
  patrolWeights: { easy: 0.5, medium: 0.35, hard: 0.15 } satisfies Record<Exclude<Difficulty, 'boss'>, number>,
  /** Loot multipliers by difficulty; bosses keep their own rows. */
  rewards: {
    easy: { goldXp: 1, chance: 1, amount: 1, raritySteps: 0 },
    medium: { goldXp: 1.3, chance: 1.25, amount: 1.25, raritySteps: 0 },
    hard: { goldXp: 1.7, chance: 1.5, amount: 1.5, raritySteps: 1 },
    boss: { goldXp: 1, chance: 1, amount: 1, raritySteps: 0 },
  } satisfies Record<Difficulty, { goldXp: number; chance: number; amount: number; raritySteps: number }>,
};

/** The threat level of a difficulty at `tier`; bosses keep their own threat. */
export function threatLevelFor(difficulty: Difficulty, tier: number): number | null {
  const levels = difficultyRules.threatLevel[difficulty];
  return levels === null ? null : levels[tier >= difficultyRules.threatLevelFromTier ? 1 : 0];
}

/** English wording; the French is in content/fr/difficulty.ts. */
export const difficultyLabels: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  boss: 'Boss',
};
