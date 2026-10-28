import { patrolRules, type PatrolRules } from '@/content/patrols';

import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { patrolPositionAt, type PatrolSpawn } from './generate';

const MINUTE = 60_000;

/** How far the spawn stands from a position at a time. */
export function distanceTo(spawn: PatrolSpawn, position: LatLng, timeMs: number): number {
  return distanceMeters(position, patrolPositionAt(spawn, timeMs));
}

/** Whether a spawn shows on the map from here. */
export function isVisible(spawn: PatrolSpawn, position: LatLng, timeMs: number, rules: PatrolRules = patrolRules) {
  return distanceTo(spawn, position, timeMs) <= rules.visibleMeters;
}

/** Whether a spawn can be fought or helped from here. */
export function inEngageRange(spawn: PatrolSpawn, position: LatLng, timeMs: number, rules: PatrolRules = patrolRules) {
  return distanceTo(spawn, position, timeMs) <= rules.engageMeters;
}

/** When goblins give up on the area: a while after first being seen. Other kinds never flee. */
export function fleesAt(spawn: PatrolSpawn, firstSeenAt: number, rules: PatrolRules = patrolRules): number | null {
  return spawn.kind === 'goblins' ? firstSeenAt + rules.goblinFleeMinutes * MINUTE : null;
}

/** Whether the goblins have already moved on. */
export function hasFled(spawn: PatrolSpawn, firstSeenAt: number | undefined, now: number, rules: PatrolRules = patrolRules) {
  if (firstSeenAt === undefined) return false;
  const at = fleesAt(spawn, firstSeenAt, rules);
  return at !== null && now >= at;
}

/** Out of play: its window is over, or it was beaten or helped this window. */
export function isGone(spawn: PatrolSpawn, beaten: Record<string, number>, now: number) {
  return spawn.endsAt <= now || (beaten[spawn.id] ?? 0) > now;
}
