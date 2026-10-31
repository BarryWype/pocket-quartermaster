import { oddsRules } from '@/content/odds';

import type { SaveData } from '../save';
import type { DungeonDef } from '../types';
import { simulateRun, type PartyMember, type RunOptions } from './simulate';
import { ODDS_RUNS, oddsRunInputs, type Odds, type OddsOptions } from './odds';

/**
 * A resumable odds estimate: exactly the runs `estimatePartyOdds` would do —
 * the same seeds, in the same order (`odds|${dungeon.id}|${i}`) — cut into
 * slices so a caller can yield between them without changing the result.
 */
export type OddsTask = {
  /** The party as they set out; stats stay fixed for the whole estimate. */
  party: PartyMember[];
  dungeon: DungeonDef;
  provisions: RunOptions;
  /** The runs to simulate, and how many are done. */
  runs: number;
  done: number;
  success: number;
  flawless: number;
  progress: number;
};

/** What an estimate of nobody is: every odds is zero. */
export const EMPTY_ODDS: Odds = { success: 0, flawless: 0, progress: 0 };

/** A resumable estimate of a prepared party; null when the party is empty (the odds are `EMPTY_ODDS`). */
export function startPartyOddsTask(
  party: PartyMember[],
  dungeon: DungeonDef,
  runs = ODDS_RUNS,
  provisions: RunOptions = {},
): OddsTask | null {
  if (party.length === 0) return null;
  return { party, dungeon, provisions, runs, done: 0, success: 0, flawless: 0, progress: 0 };
}

/** A resumable estimate of the same inputs `estimateOdds` reads (see `oddsRunInputs`). */
export function startOddsTask(
  save: SaveData,
  heroIds: string[],
  dungeon: DungeonDef,
  runs = ODDS_RUNS,
  options: OddsOptions = {},
): OddsTask | null {
  const { party, provisions } = oddsRunInputs(save, heroIds, dungeon, options);
  return startPartyOddsTask(party, dungeon, runs, provisions);
}

/** Runs up to `runs` more simulations of the task, in the same seed order as `estimatePartyOdds`. */
export function runOddsSlice(task: OddsTask, runs: number = oddsRules.runsPerSlice): void {
  const until = Math.min(task.done + Math.max(1, runs), task.runs);
  while (task.done < until) {
    const run = simulateRun(task.party, task.dungeon, `odds|${task.dungeon.id}|${task.done}`, task.provisions);
    if (run.bossDefeated) task.success++;
    if (run.outcome === 'flawless') task.flawless++;
    task.progress += run.encountersCleared / run.encounterCount;
    task.done++;
  }
}

/** Whether every run of the task is done. */
export const oddsTaskDone = (task: OddsTask): boolean => task.done >= task.runs;

/** The task's result so far; complete when `oddsTaskDone` says so. */
export function oddsOfTask(task: OddsTask): Odds {
  return { success: task.success / task.runs, flawless: task.flawless / task.runs, progress: task.progress / task.runs };
}

/** Runs every remaining slice, for the one-shot callers (the panels' fallback and the tests). */
export function finishOddsTask(task: OddsTask): Odds {
  while (!oddsTaskDone(task)) runOddsSlice(task, task.runs);
  return oddsOfTask(task);
}
