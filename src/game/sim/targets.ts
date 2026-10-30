/** What the balance lab flags. Boss days are for the regular profile; others scale them. */
export const targets = {
  /** Day (1 = first day) of each tier boss's first win: [earliest, latest]. */
  bossDays: { 1: [1, 2], 2: [3, 5], 3: [7, 10], 4: [12, 18], 5: [21, 30] } as Record<number, [number, number]>,
  /** Day the roster reaches this many heroes: [earliest, latest]. */
  recruitDays: { 4: [3, 5], 6: [7, 12] } as Record<number, [number, number]>,
  profileScale: { casual: 1.8, regular: 1, heavy: 0.6 } as Record<string, number>,
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
  /** Share of the meat and berries the regular profile gathers that food (the kitchen) uses: [min, max]. */
  foodUse: [0.6, 0.8] as [number, number],
  /** Most runs that may start Starving. */
  starvingShare: 0.1,
  /**
   * Rotating the roster must earn at least this many times the XP and gold per
   * hour of sending the same 3 heroes to the shortest tier 1 dungeon over and over.
   */
  spamAdvantage: 1.2,
  /** Changes larger than this are highlighted by compare mode. */
  compareThreshold: 0.1,
  /** Share of the regular profile's gold earned that came from patrols and travellers: [min, max]. */
  patrolGoldShare: [0.15, 0.25] as [number, number],
  /** Most of a material's walked amount that patrols may bring, per material with at least 10 walked. */
  patrolMaterialShareMax: 0.2,
  /** Most traveller recruits may move the day the roster reaches its 4th or 6th hero. */
  travellerRecruitShiftDays: 1,
};

export type Targets = typeof targets;

/** A regular-profile day range scaled for another profile. */
function scaled([min, max]: [number, number], profile: string, t: Targets): [number, number] {
  const scale = t.profileScale[profile] ?? 1;
  return [Math.max(1, Math.floor(min * scale)), Math.ceil(max * scale)];
}

/** A boss's target days for a profile. */
export const bossTarget = (tier: number, profile: string, t: Targets = targets) => scaled(t.bossDays[tier], profile, t);

/** The day range for the roster's Nth hero, for a profile. */
export const recruitTarget = (heroes: number, profile: string, t: Targets = targets) => scaled(t.recruitDays[heroes], profile, t);
