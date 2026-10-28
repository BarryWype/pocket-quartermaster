import { patrolRules, travellerRules, type PatrolRules } from '@/content/patrols';

import { createAnimalPath, animalPositionAt } from '../generation/animalPaths';
import { distanceMeters } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import { tilesAround } from '../generation/tiles';
import { windowIndex, windowRange } from '../generation/time';
import type { AnimalPath, LatLng } from '../generation/types';

export type PatrolKind = 'goblins' | 'herd' | 'bandits';
export type TravellerKind = 'wounded' | 'pilgrim' | 'trader';
/** Anything that roams the map: a patrol to fight, or a traveller to help. */
export type PatrolSubject = PatrolKind | TravellerKind;

export const PATROL_KINDS: PatrolKind[] = ['goblins', 'herd', 'bandits'];
export const TRAVELLER_KINDS: TravellerKind[] = ['wounded', 'pilgrim', 'trader'];

export const isPatrolKind = (kind: PatrolSubject): kind is PatrolKind =>
  (PATROL_KINDS as string[]).includes(kind);
export const isTravellerKind = (kind: PatrolSubject): kind is TravellerKind =>
  (TRAVELLER_KINDS as string[]).includes(kind);

/** The tier a spawn fights at, relative to the highest unlocked one. */
export type TierRoll = 'current' | 'below' | 'elite';

export type PatrolSpawn = {
  id: string;
  tile: string;
  window: number;
  kind: PatrolSubject;
  /** Travellers always read as the current tier. */
  tierRoll: TierRoll;
  path: AnimalPath;
  startsAt: number;
  endsAt: number;
};

function tierRollOf(rng: Rng, rules: PatrolRules): TierRoll {
  return rng.weighted(['current', 'below', 'elite'] as TierRoll[], (roll) => rules.tierWeights[roll]);
}

/**
 * A loop through the tile, walked at a seeded speed in the rules' range: the
 * loop lasts as long as its own length at that speed, instead of a fixed time.
 */
function patrolPath(tile: string, rng: Rng, rules: PatrolRules): AnimalPath {
  const PLACEHOLDER_MINUTES = 1;
  const placeholderMs = PLACEHOLDER_MINUTES * 60_000;
  const placeholder = createAnimalPath(tile, rng, rules.waypoints, PLACEHOLDER_MINUTES);
  const total = placeholder.waypoints.reduce(
    (sum, from, i) => sum + distanceMeters(from, placeholder.waypoints[(i + 1) % placeholder.waypoints.length]),
    0,
  );
  const [min, max] = rules.speedKmh;
  const metresPerMinute = ((min + rng.next() * (max - min)) * 1000) / 60;
  const loopMs = total > 0 && metresPerMinute > 0 ? (total / metresPerMinute) * 60_000 : placeholderMs;
  return { waypoints: placeholder.waypoints, loopMs, phaseMs: (placeholder.phaseMs / placeholderMs) * loopMs };
}

/**
 * The patrols and travellers of one tile in one window, rolled from the tile
 * and the window alone, so every player at the same place sees the same spawns.
 */
export function generateTilePatrols(tile: string, window: number, rules: PatrolRules = patrolRules): PatrolSpawn[] {
  const rng = createRng(`patrol|${tile}|${window}`);
  const { start, end } = windowRange(window, rules.windowMinutes);
  const count = rng.weighted([0, 1, 2], (n) => rules.patrolCountWeights[n]);
  return Array.from({ length: count }, (_, i): PatrolSpawn => {
    const traveller = rng.chance(1 / rules.travellerEvery);
    const kind = traveller
      ? rng.weighted(TRAVELLER_KINDS, (kind) => travellerRules.kinds[kind])
      : rng.weighted(PATROL_KINDS, (kind) => rules.kindWeights[kind]);
    return {
      id: `patrol:${tile}:${window}:${i}`,
      tile,
      window,
      kind,
      tierRoll: traveller ? 'current' : tierRollOf(rng, rules),
      path: patrolPath(tile, rng, rules),
      startsAt: start,
      endsAt: end,
    };
  });
}

/** Every spawn in the tiles around a position, for the window the time falls in. */
export function patrolsAround(position: LatLng, timeMs: number, rules: PatrolRules = patrolRules): PatrolSpawn[] {
  const window = windowIndex(timeMs, rules.windowMinutes);
  return tilesAround(position, rules.precision).flatMap((tile) => generateTilePatrols(tile, window, rules));
}

/** The tier and elite flag a spawn fights at, given the highest unlocked tier. */
export function patrolTier(spawn: PatrolSpawn, highestTier: number): { tier: number; elite: boolean } {
  if (spawn.tierRoll === 'below') return { tier: Math.max(1, highestTier - 1), elite: false };
  return { tier: highestTier, elite: spawn.tierRoll === 'elite' };
}

/** Where a spawn stands at a time. */
export function patrolPositionAt(spawn: PatrolSpawn, timeMs: number): LatLng {
  return animalPositionAt(spawn.path, timeMs);
}

/** The window a spawn id belongs to ends here, for pruning bookkeeping kept by id. */
export function windowEndOf(patrolId: string, rules: PatrolRules = patrolRules): number | null {
  const window = Number(patrolId.split(':')[2]);
  return Number.isFinite(window) ? windowRange(window, rules.windowMinutes).end : null;
}

/** Drops bookkeeping whose spawn's window is over (trader use counts keep their spawn id in the key). */
export function pruneByWindow<T extends Record<string, number>>(bookkeeping: T, now: number, rules: PatrolRules = patrolRules): T {
  return Object.fromEntries(
    Object.entries(bookkeeping).filter(([id]) => (windowEndOf(id, rules) ?? 0) > now),
  ) as T;
}
