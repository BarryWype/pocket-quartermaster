import { patrolRow, patrolRules, travellerRules, type PatrolDifficulty, type PatrolRules } from '@/content/patrols';
import { difficultyRules } from '@/content/difficulty';
import { placeFightRules } from '@/content/placeFights';

import { ELEMENTS, type Element } from '../elements';
import { createAnimalPath, animalPositionAt } from '../generation/animalPaths';
import { distanceMeters } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import { tileCenter, tilesAround } from '../generation/tiles';
import { windowIndex, windowRange } from '../generation/time';
import type { AnimalPath, LatLng } from '../generation/types';

export type PatrolKind =
  | 'goblins'
  | 'herd'
  | 'bandits'
  | 'wolves'
  | 'orcs'
  | 'spiders'
  | 'eliteGoblins'
  | 'outlaws'
  | 'ogres'
  | 'eliteOrcs'
  | 'trolls'
  | 'wraiths'
  | 'wyverns'
  | 'golems';
export type TravellerKind = 'wounded' | 'pilgrim' | 'trader';
/** Anything that roams the map: a patrol to fight, or a traveller to help. */
export type PatrolSubject = PatrolKind | TravellerKind;

export const PATROL_KINDS: PatrolKind[] = [
  'goblins',
  'herd',
  'bandits',
  'wolves',
  'orcs',
  'spiders',
  'eliteGoblins',
  'outlaws',
  'ogres',
  'eliteOrcs',
  'trolls',
  'wraiths',
  'wyverns',
  'golems',
];
export const TRAVELLER_KINDS: TravellerKind[] = ['wounded', 'pilgrim', 'trader'];

export const isPatrolKind = (kind: PatrolSubject): kind is PatrolKind =>
  (PATROL_KINDS as string[]).includes(kind);
export const isTravellerKind = (kind: PatrolSubject): kind is TravellerKind =>
  (TRAVELLER_KINDS as string[]).includes(kind);

export type PatrolSpawn = {
  id: string;
  tile: string;
  window: number;
  kind: PatrolSubject;
  /** The difficulty band it fights at; null for travellers. */
  difficulty: PatrolDifficulty | null;
  /** The tier it fights at: always the highest unlocked one. */
  tier: number;
  path: AnimalPath;
  startsAt: number;
  endsAt: number;
};

const PATROL_DIFFICULTIES: PatrolDifficulty[] = ['easy', 'medium', 'hard'];

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
 * The patrols and travellers of one tile in one window, rolled from the tile,
 * the window and the highest unlocked tier alone, so every player at the same
 * place sees the same spawns. A tile boosted by a nearby monster lair draws its
 * count from the lair's weights instead; the draw order is unchanged, so other
 * tiles keep their spawns.
 */
export function generateTilePatrols(
  tile: string,
  window: number,
  highestTier: number,
  rules: PatrolRules = patrolRules,
  boosted = false,
): PatrolSpawn[] {
  const rng = createRng(`patrol|${tile}|${window}`);
  const { start, end } = windowRange(window, rules.windowMinutes);
  const countWeights = boosted ? placeFightRules.lair.patrolCountWeights : rules.patrolCountWeights;
  const count = rng.weighted([0, 1, 2], (n) => countWeights[n]);
  return Array.from({ length: count }, (_, i): PatrolSpawn => {
    const traveller = rng.chance(1 / rules.travellerEvery);
    const difficulty = traveller ? null : rng.weighted(PATROL_DIFFICULTIES, (d) => difficultyRules.patrolWeights[d]);
    const kind = difficulty
      ? patrolRow(highestTier)[difficulty][rng.chance(0.5) ? 0 : 1]
      : rng.weighted(TRAVELLER_KINDS, (kind) => travellerRules.kinds[kind]);
    return {
      id: `patrol:${tile}:${window}:${i}`,
      tile,
      window,
      kind,
      difficulty,
      tier: highestTier,
      path: patrolPath(tile, rng, rules),
      startsAt: start,
      endsAt: end,
    };
  });
}

/** Every spawn in the tiles around a position, for the window the time falls in; tiles near a live lair spawn more. */
export function patrolsAround(
  position: LatLng,
  timeMs: number,
  highestTier: number,
  rules: PatrolRules = patrolRules,
  lairs: LatLng[] = [],
): PatrolSpawn[] {
  const window = windowIndex(timeMs, rules.windowMinutes);
  return tilesAround(position, rules.precision).flatMap((tile) =>
    generateTilePatrols(tile, window, highestTier, rules, lairs.some((lair) => distanceMeters(tileCenter(tile), lair) <= placeFightRules.lair.radiusMeters)),
  );
}

/** The element a wyvern patrol bears, fixed per spawn (like a rift's, see places/fights.ts). */
export function wyvernElement(spawn: PatrolSpawn): Element {
  return createRng(`wyvern|${spawn.id}`).weighted(ELEMENTS, () => 1);
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
