// Heroes with a history (see game/team/record.ts): titles earned once each
// from a hero's record, shown under their name. Titles give no stats.

/** What a title asks of the hero's record. */
export type TitleCondition =
  | { kind: 'runs' | 'wins' | 'bosses' | 'kills' | 'heroOfRun' | 'knockouts' | 'tierBossKills'; count: number }
  /** Runs in a row without a knockout. */
  | { kind: 'cleanStreak'; count: number }
  /** Runs as the party's least-damaged hero who healed. */
  | { kind: 'patient'; count: number }
  /** Companions (see `heroRecordRules.companionRuns`). */
  | { kind: 'companions'; count: number }
  /** Different heroes run with. */
  | { kind: 'partners'; count: number };

export type HeroTitleDef = { id: string; name: string; description: string; condition: TitleCondition };

export const heroTitles: HeroTitleDef[] = [
  { id: 'giantSlayer', name: 'Giant-slayer', description: 'Landed the killing blow on a tier boss.', condition: { kind: 'tierBossKills', count: 1 } },
  { id: 'unbroken', name: 'the Unbroken', description: '20 runs in a row without a knockout.', condition: { kind: 'cleanStreak', count: 20 } },
  { id: 'patient', name: 'the Patient', description: '10 runs as the least-hurt hero who healed.', condition: { kind: 'patient', count: 10 } },
  { id: 'seasoned', name: 'the Seasoned', description: '25 runs.', condition: { kind: 'runs', count: 25 } },
  { id: 'oldHand', name: 'Old hand', description: '100 runs.', condition: { kind: 'runs', count: 100 } },
  { id: 'victorious', name: 'the Victorious', description: '50 wins.', condition: { kind: 'wins', count: 50 } },
  { id: 'tyrantBreaker', name: 'Tyrant-breaker', description: '10 bosses beaten.', condition: { kind: 'bosses', count: 10 } },
  { id: 'monsterHunter', name: 'Monster-hunter', description: '300 kills.', condition: { kind: 'kills', count: 300 } },
  { id: 'heroOfTheHour', name: 'Hero of the hour', description: 'Hero of the run 10 times.', condition: { kind: 'heroOfRun', count: 10 } },
  { id: 'scarred', name: 'the Scarred', description: 'Knocked out 10 times, and still going.', condition: { kind: 'knockouts', count: 10 } },
  { id: 'loyal', name: 'the Loyal', description: 'Has a companion.', condition: { kind: 'companions', count: 1 } },
  { id: 'friendToAll', name: 'Friend to all', description: 'Has run with 8 different heroes.', condition: { kind: 'partners', count: 8 } },
];

export const heroTitleById = Object.fromEntries(heroTitles.map((title) => [title.id, title]));

export const heroRecordRules = {
  /** Two heroes who have run together this many times are companions. */
  companionRuns: 15,
  /** Chance per run that the log tells of companions in the party. */
  companionLineChance: 0.25,
};
