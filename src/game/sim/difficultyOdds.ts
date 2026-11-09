import { difficultyRules } from '@/content/difficulty';
import { dungeonById } from '@/content/lookup';
import { patrolDifficulty, patrolRow, type PatrolDifficulty } from '@/content/patrols';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';
import { bossWeaknesses } from '@/content/weaknesses';

import { tierChain } from '../dungeons/unlock';
import { rotationDay } from '../dungeons/rotation';
import { composeBriefing } from '../threats/compose';
import { estimateOdds } from '../expeditions/odds';
import type { LatLng } from '../generation/types';
import { placeFightBriefing, placeFightDungeon, placeFightOdds } from '../places/fights';
import { placeGroupOf, type PlaceSpawn } from '../places/generate';
import { isElitePatrolKind } from '@/content/enemies';
import { patrolBriefing, patrolDungeon, patrolOdds } from '../patrols/fight';
import type { PatrolKind, PatrolSpawn } from '../patrols/generate';
import type { SaveData } from '../save';
import type { Briefing, DungeonDef } from '../types';
import { suggestParty } from '../threats/suggest';
import { rosterRules } from '@/content/roster';
import { withLoadout } from './bot';
import { EMPTY_BRIEFING } from '../expeditions/simulate';
import { dressParty } from '../families/dress';
import { naturalGear, rosterSave } from './reference';
import { simConfig } from './config';

/** A fight source whose strength the fitting script tunes. */
export type FitSource =
  | { kind: 'dungeon'; id: string }
  | { kind: 'patrol'; patrolKind: PatrolKind }
  | { kind: 'event'; placeKind: FightPlaceKind }
  | { kind: 'boss'; id: string };

/** The days the odds are averaged over, one briefing each. */
export const FIT_DAYS = [0, 1, 2].map((i) => rotationDay(Date.UTC(2026, 0, 10 + i)));
/** When the fights are measured: noon of the first fitting day. */
export const FIT_NOW = Date.UTC(2026, 0, 10) + 12 * 3_600_000;
/** Runs per estimate when the full simulator measures the difficulty odds for its summary. */
export const SUMMARY_RUNS = 100;

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/** Every boss weakness item in stock, as the bot's prepared loadout picks from. */
function stocked(save: SaveData): SaveData {
  return {
    ...save,
    consumables: {
      ...save.consumables,
      ...Object.fromEntries(bossWeaknesses.map((w) => [w.itemId, 1])),
    },
  };
}

/** The save a party is measured with: dressed for its briefing from the spare pool (families/dress.ts), then the loadout. */
export function prepared(save: SaveData, heroIds: string[], dungeon: DungeonDef, briefing: Parameters<typeof withLoadout>[3]): SaveData {
  return withLoadout(stocked(dressParty(save, heroIds, briefing)), heroIds, dungeon, briefing);
}

/**
 * The party the bot would send from a roster (bot.ts bestParty): suggestParty
 * with the bot's quick odds and its stop rule, dressed for the briefing, then
 * its loadout with every weakness item in stock. `skipped`: the briefing
 * skipped, the strongest party as if there were no threats, in natural gear
 * (reference.ts naturalGear).
 */
export function rosterParty(save: SaveData, dungeon: DungeonDef, briefing: Briefing, slots: number, now: number, skipped = false) {
  const plan = skipped ? EMPTY_BRIEFING : briefing;
  const candidates = save.heroes.map((h) => h.id);
  const base = skipped ? naturalGear(save, candidates) : stocked(save);
  const quick = (dressed: SaveData, ids: string[]) => {
    const o = estimateOdds(withLoadout(dressed, ids, dungeon, plan), ids, dungeon, simConfig.odds.searchRuns, { now, briefing: plan });
    return o.success + o.progress * 1e-6;
  };
  const party = suggestParty(base, plan, slots, { candidates, odds: quick, enough: simConfig.odds.enough, dress: !skipped });
  return { heroIds: party.heroIds, save: withLoadout(party.save, party.heroIds, dungeon, plan) };
}

/** A source's odds for the party the bot would send from the reference roster. */
function partyOdds(save: SaveData, dungeon: DungeonDef, briefing: Briefing, slots: number, measure: (save: SaveData, heroIds: string[]) => number) {
  const party = rosterParty(save, dungeon, briefing, slots, FIT_NOW);
  return measure(party.save, party.heroIds);
}

/** The odds of one source for the reference roster at a tier's start or end, as a share of runs won. */
export function sourceOdds(source: FitSource, tier: number, when: 'start' | 'end', runs: number): number {
  const base = rosterSave(tier, when);
  if (source.kind === 'dungeon' || source.kind === 'boss') {
    const dungeon = dungeonById[source.id];
    return mean(
      FIT_DAYS.map((day) => {
        const briefing = composeBriefing(dungeon, day);
        return partyOdds(base, dungeon, briefing, rosterRules.partySize, (save, ids) => estimateOdds(save, ids, dungeon, runs, { now: FIT_NOW, briefing }).success);
      }),
    );
  }
  if (source.kind === 'patrol') {
    const kind = source.patrolKind;
    const difficulty = patrolDifficulty(kind, tier);
    if (!difficulty) throw new Error(`Patrol kind ${kind} does not spawn at tier ${tier}`);
    const spawn: PatrolSpawn = {
      id: `fit|${kind}|${tier}`,
      tile: 'fit',
      window: 0,
      kind,
      difficulty,
      tier,
      path: { waypoints: [], loopMs: 1, phaseMs: 0 },
      startsAt: 0,
      endsAt: Infinity,
    };
    const dungeon = patrolDungeon(spawn, tier, isElitePatrolKind(kind));
    return partyOdds(base, dungeon, patrolBriefing(spawn), difficultyRules.patrolParty[difficulty], (save, ids) => patrolOdds(save, spawn, ids, FIT_NOW, runs).success);
  }
  const kind = source.placeKind;
  return mean(
    [0, 1, 2].map((i) => {
      const spawn: PlaceSpawn = {
        id: `fit|${kind}|${i}`,
        kind,
        group: placeGroupOf(kind).id,
        tile: 'fit',
        position: { latitude: 0, longitude: 0 } as LatLng,
        startsAt: 0,
        expiresAt: Infinity,
        roll: 0,
      };
      const briefing = placeFightBriefing(base, spawn);
      return partyOdds(base, placeFightDungeon(spawn, tier), briefing, rosterRules.partySize, (save, ids) => placeFightOdds(save, spawn, ids, FIT_NOW, runs).success);
    }),
  );
}

/** One tier's per-difficulty odds of its sources, for the quick probe and the summary. */
export type DifficultyOdds = Record<PatrolDifficulty, { start: number; end: number }>;

/** The sources of one difficulty at a tier, as the fitting script and the probes see them. */
export function sourcesOf(tier: number, difficulty: PatrolDifficulty): FitSource[] {
  return [
    ...tierChain(tier)
      .filter((d) => d.chainIndex !== undefined && d.chainIndex < 6 && d.difficulty === difficulty)
      .map((d) => ({ kind: 'dungeon' as const, id: d.id })),
    ...patrolRow(tier)[difficulty].map((patrolKind) => ({ kind: 'patrol' as const, patrolKind })),
    ...(Object.keys(placeFightRules.kinds) as FightPlaceKind[])
      .filter((placeKind) => placeFightRules.kinds[placeKind].difficulty === difficulty)
      .map((placeKind) => ({ kind: 'event' as const, placeKind })),
  ];
}

/** The mean odds of a tier's sources of one difficulty, at its start or end. */
export function difficultyOdds(tier: number, difficulty: PatrolDifficulty, when: 'start' | 'end', runs: number): number {
  return mean(sourcesOf(tier, difficulty).map((source) => sourceOdds(source, tier, when, runs)));
}

/** Every tier's per-difficulty odds, the shape summary.json's `difficultyOdds` keeps. */
export function difficultyOddsByTier(runs = SUMMARY_RUNS): Record<number, DifficultyOdds> {
  const out: Record<number, DifficultyOdds> = {};
  for (const tier of [1, 2, 3, 4, 5]) {
    out[tier] = Object.fromEntries(
      (['easy', 'medium', 'hard'] as PatrolDifficulty[]).map((difficulty) => [
        difficulty,
        { start: difficultyOdds(tier, difficulty, 'start', runs), end: difficultyOdds(tier, difficulty, 'end', runs) },
      ]),
    ) as DifficultyOdds;
  }
  return out;
}


