/** What the balance lab flags. Boss days are for the regular profile; others scale them. */
export const targets = {
  /** Day (1 = first day) of each tier boss's first win: [earliest, latest]. */
  bossDays: { 1: [1, 2], 2: [3, 5], 3: [7, 10], 4: [12, 18], 5: [21, 30] } as Record<number, [number, number]>,
  profileScale: { casual: 1.8, regular: 1, dedicated: 0.6 } as Record<string, number>,
  /** Gold held above this many days of income… */
  goldPileDays: 5,
  /** …for more days in a row than this. */
  goldPileStreak: 3,
  /** Share of sessions heroes are left at home. */
  idleShare: 0.4,
  /** Days for a Guild Hall rank to earn back its cost. */
  paybackDays: [3, 7] as [number, number],
  /** A material gathered at least this much and never used. */
  unusedStockpile: 20,
  /** Share of Crappy pieces at a boss attempt. */
  crappyAtBoss: 0.5,
  /** Changes larger than this are highlighted by compare mode. */
  compareThreshold: 0.1,
};

export type Targets = typeof targets;

/** A boss's target days for a profile. */
export function bossTarget(tier: number, profile: string, t: Targets = targets): [number, number] {
  const scale = t.profileScale[profile] ?? 1;
  const [min, max] = t.bossDays[tier];
  return [Math.max(1, Math.floor(min * scale)), Math.ceil(max * scale)];
}
