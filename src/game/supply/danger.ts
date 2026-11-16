import { patrolRules } from '@/content/patrols';
import type { PatrolDifficulty } from '@/content/patrols';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';
import { supplyRules } from '@/content/supplyLines';
import type { Difficulty } from '@/content/difficulty';

import { highestUnlockedTier } from '../expeditions/expeditions';
import { distanceMeters } from '../generation/geo';
import { tileCenter, tilesAround } from '../generation/tiles';
import { windowIndex, windowRange } from '../generation/time';
import type { LatLng } from '../generation/types';
import { activeLairs } from '../places/fights';
import { placeGroupOf, placesAround } from '../places/generate';
import { generateTilePatrols, isPatrolKind, patrolPositionAt, type PatrolSpawn } from '../patrols/generate';
import type { SaveData } from '../save';

/** What danger depends on per player: the tier, beaten patrols and used places. */
export type DangerContext = { tier: number; beatenPatrols: Record<string, number>; usedPlaces: Record<string, number> };

export function dangerContextOf(save: SaveData): DangerContext {
  return { tier: highestUnlockedTier(save), beatenPatrols: save.beatenPatrols, usedPlaces: save.usedPlaces };
}

const METERS_PER_DEGREE = 111_320;

/** Flat-plane distance test with a latitude prefilter, fine at these distances. */
function withinMeters(a: LatLng, b: LatLng, meters: number): boolean {
  const dy = Math.abs(a.latitude - b.latitude) * METERS_PER_DEGREE;
  if (dy > meters) return false;
  const dx = Math.abs(a.longitude - b.longitude) * METERS_PER_DEGREE * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dx, dy) <= meters;
}

/** A difficulty's score weight; a boss counts as hard. */
function weightOf(difficulty: PatrolDifficulty | Difficulty): number {
  return supplyRules.danger.weights[difficulty === 'boss' ? 'hard' : difficulty];
}

/** The live lairs around the cells: one search per distinct precision-5 prefix, deduped by position. */
function lairsFor(cells: string[], timeMs: number, ctx: DangerContext): LatLng[] {
  const lairs: LatLng[] = [];
  for (const prefix of new Set(cells.map((cell) => cell.slice(0, 5)))) {
    for (const lair of activeLairs(tileCenter(prefix), timeMs, ctx.usedPlaces)) {
      if (!lairs.some((other) => other.latitude === lair.latitude && other.longitude === lair.longitude)) lairs.push(lair);
    }
  }
  return lairs;
}

/** The patrols that could touch the cells in the window: not travellers, not beaten. */
function patrolsFor(cells: string[], timeMs: number, ctx: DangerContext) {
  const window = windowIndex(timeMs, patrolRules.windowMinutes);
  const lairs = lairsFor(cells, timeMs, ctx);
  const spawns: PatrolSpawn[] = [];
  for (const tile of new Set(cells.flatMap((cell) => tilesAround(tileCenter(cell), patrolRules.precision)))) {
    const boosted = lairs.some((lair) => distanceMeters(tileCenter(tile), lair) <= placeFightRules.lair.radiusMeters);
    spawns.push(
      ...generateTilePatrols(tile, window, ctx.tier, patrolRules, boosted).filter(
        (spawn) => isPatrolKind(spawn.kind) && !(spawn.id in ctx.beatenPatrols),
      ),
    );
  }
  return { window, lairs, spawns };
}

/** A patrol's track during its window, sampled every `trackStepMinutes`. */
function trackOf(spawn: PatrolSpawn, window: number): LatLng[] {
  const { start, end } = windowRange(window, patrolRules.windowMinutes);
  const step = supplyRules.danger.trackStepMinutes * 60_000;
  const points: LatLng[] = [];
  for (let t = start; t < end; t += step) points.push(patrolPositionAt(spawn, t));
  points.push(patrolPositionAt(spawn, end));
  return points;
}

/** The fight events live at a time within reach of a point, not used up. */
function eventsNear(centre: LatLng, timeMs: number, ctx: DangerContext) {
  return placesAround(centre, timeMs, [placeGroupOf('banditCamp')]).filter(
    (spawn) =>
      spawn.startsAt <= timeMs &&
      timeMs < spawn.expiresAt &&
      !(spawn.id in ctx.usedPlaces) &&
      withinMeters(spawn.position, centre, supplyRules.danger.eventMeters),
  );
}

/** The danger level a score means: how many thresholds it has reached. */
export function dangerLevel(score: number): 0 | 1 | 2 | 3 {
  return supplyRules.danger.levelFrom.filter((threshold) => score >= threshold).length as 0 | 1 | 2 | 3;
}

/** The chance a crossing of a cell at this level ambushes. */
export function ambushChance(level: 0 | 1 | 2 | 3): number {
  return supplyRules.danger.ambushChance[level];
}

/** Each cell's danger score and level at a time (see the design doc's formula). */
export function cellDangers(cells: string[], timeMs: number, ctx: DangerContext): Record<string, { score: number; level: 0 | 1 | 2 | 3 }> {
  const { window, lairs, spawns } = patrolsFor(cells, timeMs, ctx);
  const tracks = spawns.map((spawn) => ({ spawn, points: trackOf(spawn, window) }));
  const dangers: Record<string, { score: number; level: 0 | 1 | 2 | 3 }> = {};
  for (const cell of cells) {
    const centre = tileCenter(cell);
    let score = 0;
    for (const { spawn, points } of tracks) {
      if (points.some((point) => withinMeters(point, centre, supplyRules.danger.patrolMeters))) {
        score += weightOf(spawn.difficulty!);
      }
    }
    for (const event of eventsNear(centre, timeMs, ctx)) {
      score += weightOf(placeFightRules.kinds[event.kind as FightPlaceKind].difficulty);
    }
    for (const lair of lairs) {
      if (withinMeters(lair, centre, supplyRules.danger.lairMeters)) score += supplyRules.danger.lairWeight;
    }
    dangers[cell] = { score, level: dangerLevel(score) };
  }
  return dangers;
}

/**
 * The patrol that would ambush a crossing of the cell in that window: the
 * highest difficulty, then the nearest it comes to the cell, then the lowest id.
 */
export function cellAmbusher(cell: string, timeMs: number, ctx: DangerContext): PatrolSpawn | null {
  const { window, spawns } = patrolsFor([cell], timeMs, ctx);
  let best: { spawn: PatrolSpawn; distance: number } | null = null;
  for (const spawn of spawns) {
    const closest = Math.min(...trackOf(spawn, window).map((point) => distanceMeters(point, tileCenter(cell))));
    if (closest > supplyRules.danger.patrolMeters) continue;
    const better =
      !best ||
      weightOf(spawn.difficulty!) > weightOf(best.spawn.difficulty!) ||
      (weightOf(spawn.difficulty!) === weightOf(best.spawn.difficulty!) &&
        (closest < best.distance || (closest === best.distance && spawn.id < best.spawn.id)));
    if (better) best = { spawn, distance: closest };
  }
  return best?.spawn ?? null;
}
