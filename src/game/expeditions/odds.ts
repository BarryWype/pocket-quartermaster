import type { SaveData } from '../save';
import type { Briefing, DungeonDef } from '../types';
import { launchPlan, runProvisions, type Loadout } from './expeditions';
import { EMPTY_BRIEFING, prepareParty, prepareSimulation, runPrepared, type PartyMember, type RunOptions } from './simulate';

export type Odds = {
  /** Share of runs that beat the boss (0-1). */
  success: number;
  /** Share of runs that beat the boss with nobody knocked out. */
  flawless: number;
  /** Average share of encounters cleared. */
  progress: number;
};

export type OddsBand = 'Hopeless' | 'Risky' | 'Fair' | 'Favourable' | 'AlmostSure';

/**
 * Runs per estimate. The seeds are fixed so the preview doesn't flicker, which
 * makes its error the same every time: 100 runs could be 7 points off for a
 * dungeon, 300 keep it to about 3.
 */
export const ODDS_RUNS = 300;

export type OddsOptions = {
  /** HP is taken at this time; left out, as stored. */
  now?: number;
  loadout?: Loadout;
  /** Every hero at full HP, for comparison. */
  fullHp?: boolean;
  /** The dungeon's briefing; left out, the odds are for no threats at all. */
  briefing?: Briefing;
};

/** Runs a prepared party through the dungeon with many seeds. */
export function estimatePartyOdds(party: PartyMember[], dungeon: DungeonDef, runs = ODDS_RUNS, provisions: RunOptions = {}): Odds {
  if (party.length === 0) return { success: 0, flawless: 0, progress: 0 };
  // The runs share everything the seeds don't touch: one preparation, 300 plays.
  const prepared = prepareSimulation(party, dungeon, provisions);
  let success = 0;
  let flawless = 0;
  let progress = 0;
  for (let i = 0; i < runs; i++) {
    const run = runPrepared(prepared, `odds|${dungeon.id}|${i}`);
    if (run.bossDefeated) success++;
    if (run.outcome === 'flawless') flawless++;
    progress += run.encountersCleared / run.encounterCount;
  }
  return { success: success / runs, flawless: flawless / runs, progress: progress / runs };
}

/**
 * Estimates a party's chances by running the dungeon with many seeds, with
 * their current HP and the supply, meal and briefing they would take. The real
 * expedition uses its own seed, so this is a preview, not a promise.
 */
export function estimateOdds(save: SaveData, heroIds: string[], dungeon: DungeonDef, runs = ODDS_RUNS, options: OddsOptions = {}): Odds {
  const { now, loadout = {}, fullHp = false, briefing = EMPTY_BRIEFING } = options;
  const party = prepareParty(save, heroIds, now, true).map((m) => (fullHp ? { ...m, hp: m.maxHp } : m));
  const { hunger } = launchPlan(save, dungeon, heroIds, loadout, briefing);
  // The waiting chapel blessing, if this run would spend it.
  return estimatePartyOdds(party, dungeon, runs, { ...runProvisions(hunger, loadout, briefing), blessed: save.expeditionBlessing });
}

/**
 * The bands are wide because a 300-run estimate carries about ±3 points of
 * noise, and the top band is not "certain" because the mishap chance caps true
 * odds below ~0.97.
 */
export function oddsBand(success: number): OddsBand {
  if (success < 0.15) return 'Hopeless';
  if (success < 0.4) return 'Risky';
  if (success < 0.65) return 'Fair';
  if (success < 0.9) return 'Favourable';
  return 'AlmostSure';
}
