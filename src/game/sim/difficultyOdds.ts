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
import type { DungeonDef } from '../types';
import { withLoadout } from './bot';
import { EMPTY_BRIEFING } from '../expeditions/simulate';
import { dressParty } from '../families/dress';
import { referenceSave } from './reference';

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

/** The save a hard or boss source is measured with: dressed for its briefing from the spare pool (families/dress.ts), then the loadout. */
export function prepared(save: SaveData, heroIds: string[], dungeon: DungeonDef, briefing: Parameters<typeof withLoadout>[3]): SaveData {
  return withLoadout(stocked(dressParty(save, heroIds, briefing)), heroIds, dungeon, briefing);
}

/** The save an easy or medium source is measured with: the briefing skipped, dressed for the team's playstyle family only. */
const natural = (save: SaveData, heroIds: string[]): SaveData => dressParty(save, heroIds, EMPTY_BRIEFING);

/** The odds of one source for a reference team at a tier's start or end, as a share of runs won. */
export function sourceOdds(source: FitSource, tier: number, when: 'start' | 'end', runs: number): number {
  if (source.kind === 'dungeon' || source.kind === 'boss') {
    const dungeon = dungeonById[source.id];
    const base = referenceSave(tier, when, 3);
    const ids = base.heroes.map((h) => h.id);
    const isPrepared = source.kind === 'boss' || dungeon.difficulty === 'hard';
    return mean(
      FIT_DAYS.map((day) => {
        const briefing = composeBriefing(dungeon, day);
        const save = isPrepared ? prepared(base, ids, dungeon, briefing) : natural(base, ids);
        return estimateOdds(save, ids, dungeon, runs, { now: FIT_NOW, briefing }).success;
      }),
    );
  }
  if (source.kind === 'patrol') {
    const kind = source.patrolKind;
    const difficulty = patrolDifficulty(kind, tier);
    if (!difficulty) throw new Error(`Patrol kind ${kind} does not spawn at tier ${tier}`);
    const party = difficultyRules.patrolParty[difficulty];
    const base = referenceSave(tier, when, party);
    const ids = base.heroes.map((h) => h.id);
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
    const save = difficulty === 'hard' ? prepared(base, ids, dungeon, patrolBriefing(spawn)) : natural(base, ids);
    return patrolOdds(save, spawn, ids, FIT_NOW, runs).success;
  }
  const kind = source.placeKind;
  const difficulty = placeFightRules.kinds[kind].difficulty;
  const base = referenceSave(tier, when, 3);
  const ids = base.heroes.map((h) => h.id);
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
      const save = difficulty === 'hard' ? prepared(base, ids, placeFightDungeon(spawn, tier), briefing) : natural(base, ids);
      return placeFightOdds(save, spawn, ids, FIT_NOW, runs).success;
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


