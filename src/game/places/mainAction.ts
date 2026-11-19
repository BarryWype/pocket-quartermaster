import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';

/** What a map sheet's main button does. */
export type SheetAction<R extends string = string> =
  /** The player can do it now. */
  | { kind: 'act' }
  /** Out of range: the button says how far to walk, and centres the map on the place. */
  | { kind: 'walk'; meters: number }
  /** In range, or doable from anywhere, but something else stops it. */
  | { kind: 'blocked'; reason: R };

/**
 * The distance-aware main action of a map sheet. Distance is judged here, so a
 * rule's own `tooFar` is ignored; out of range, the walk wins over any other
 * problem, because the player has to get there first.
 */
export function mainAction<R extends string>(input: {
  player: LatLng;
  target: LatLng;
  /** The interaction range in metres (placeRules.interactionMeters, patrolRules.engageMeters, ...). */
  range: number;
  /** The rule's own problem for the action, or null. */
  problem: R | 'tooFar' | null;
  /** True for actions that work from any distance (posting a hero, adding a stop to the delivery route). */
  anywhere?: boolean;
}): SheetAction<Exclude<R, 'tooFar'>> {
  const { player, target, range, problem, anywhere } = input;
  const distance = distanceMeters(player, target);
  if (!anywhere && distance > range) return { kind: 'walk', meters: Math.round(distance) };
  if (problem !== null && problem !== 'tooFar') return { kind: 'blocked', reason: problem as Exclude<R, 'tooFar'> };
  return { kind: 'act' };
}
