import type { SaveData } from '../save';
import type { DungeonDef } from '../types';
import { prepareParty, simulateRun } from './simulate';

export type Odds = {
  /** Share of runs that beat the boss (0-1). */
  success: number;
  /** Share of runs that beat the boss with nobody knocked out. */
  flawless: number;
  /** Average share of encounters cleared. */
  progress: number;
};

export type OddsBand = 'Risky' | 'Fair' | 'Safe';

/**
 * Estimates a party's chances by running the dungeon with many seeds. The real
 * expedition uses its own seed, so this is a preview, not a promise.
 */
export function estimateOdds(save: SaveData, heroIds: string[], dungeon: DungeonDef, runs = 100): Odds {
  const party = prepareParty(save, heroIds);
  if (party.length === 0) return { success: 0, flawless: 0, progress: 0 };
  let success = 0;
  let flawless = 0;
  let progress = 0;
  for (let i = 0; i < runs; i++) {
    const run = simulateRun(party, dungeon, `odds|${dungeon.id}|${i}`);
    if (run.bossDefeated) success++;
    if (run.outcome === 'flawless') flawless++;
    progress += run.encountersCleared / run.encounterCount;
  }
  return { success: success / runs, flawless: flawless / runs, progress: progress / runs };
}

export function oddsBand(success: number): OddsBand {
  if (success < 0.4) return 'Risky';
  if (success < 0.75) return 'Fair';
  return 'Safe';
}
