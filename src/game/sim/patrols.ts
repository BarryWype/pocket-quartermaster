import { patrolRules, travellerRules } from '@/content/patrols';

import { PATROL_KINDS, TRAVELLER_KINDS, isTravellerKind, patrolsAround, type PatrolSpawn, type PatrolSubject, type TierRoll } from '../patrols/generate';
import { hasFled, isVisible } from '../patrols/visibility';
import { simConfig, type SimConfig } from './config';

const ROLLS: TierRoll[] = ['current', 'below', 'elite'];
const KINDS: PatrolSubject[] = [...PATROL_KINDS, ...TRAVELLER_KINDS];
const FIX_SECONDS = 10;

export type PatrolRates = {
  /** Distinct spawns seen per minute of walking, by kind. */
  perMinute: Record<PatrolSubject, number>;
  /** The same, by tier roll. */
  byTierRoll: Record<TierRoll, number>;
  /** Seen per minute by kind and tier roll: what a run draws its sightings from. */
  perKindRoll: Record<PatrolSubject, Record<TierRoll, number>>;
  /** Spawns met on the measured walks, by kind and tier roll: examples a run places encounters with. */
  examples: Record<PatrolSubject, Record<TierRoll, PatrolSpawn[]>>;
};

/** Changes when anything the measured walks depend on changes, so a cache can be keyed by it. */
export function patrolCacheKey(config: SimConfig = simConfig) {
  const text = JSON.stringify([patrolRules, travellerRules, config.walk.speed, config.walk.samples, config.walk.sampleHours, config.walk.sampleMinutes]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

/**
 * The patrols and travellers a straight-line wander meets per minute, by kind
 * and tier roll, at the sample places and hours, plus the spawns themselves as
 * examples. Slow: cache it.
 */
export function measurePatrolRates(config: SimConfig = simConfig): PatrolRates {
  const { samples, sampleHours, sampleMinutes } = config.walk;
  const zeros = () => Object.fromEntries(ROLLS.map((roll) => [roll, 0])) as Record<TierRoll, number>;
  const counts = Object.fromEntries(KINDS.map((kind) => [kind, zeros()])) as Record<PatrolSubject, Record<TierRoll, number>>;
  const examples = Object.fromEntries(
    KINDS.map((kind) => [kind, Object.fromEntries(ROLLS.map((roll) => [roll, [] as PatrolSpawn[]]))]),
  ) as Record<PatrolSubject, Record<TierRoll, PatrolSpawn[]>>;

  samples.forEach((start, i) => {
    for (const hour of sampleHours) {
      const walkStart = Date.UTC(2026, 9, 20 + i, hour);
      const generated = new Set<string>();
      const seenOnWalk = new Set<string>();
      const firstSeen = new Map<string, number>();
      let position = start;
      let heading = { north: 1, east: 0.3 };
      for (let t = 0; t < sampleMinutes * 60; t += FIX_SECONDS) {
        const now = walkStart + t * 1000;
        for (const spawn of patrolsAround(position, now)) {
          if (!generated.has(spawn.id)) {
            generated.add(spawn.id);
            examples[spawn.kind][spawn.tierRoll].push(spawn);
          }
          if (!isVisible(spawn, position, now)) continue;
          if (!firstSeen.has(spawn.id)) firstSeen.set(spawn.id, now);
          if (seenOnWalk.has(spawn.id) || hasFled(spawn, firstSeen.get(spawn.id), now)) continue;
          seenOnWalk.add(spawn.id);
          counts[spawn.kind][spawn.tierRoll]++;
        }
        const step = config.walk.speed * FIX_SECONDS;
        const metresPerDegree = 111_320;
        position = {
          latitude: position.latitude + (heading.north * step) / metresPerDegree,
          longitude:
            position.longitude +
            (heading.east * step) / (metresPerDegree * Math.cos((position.latitude * Math.PI) / 180)),
        };
        if (t % 600 === 0) heading = { north: heading.east, east: -heading.north };
      }
    }
  });

  // The walks see too few spawns for a steady mix, so only their total rate is
  // measured; it is split by the generation weights.
  const walks = samples.length * sampleHours.length;
  const total = KINDS.reduce((sum, kind) => sum + ROLLS.reduce((s, roll) => s + counts[kind][roll], 0), 0) / (walks * sampleMinutes);
  const travellerShare = 1 / patrolRules.travellerEvery;
  const share = (weights: Record<string, number>, key: string) => weights[key] / Object.values(weights).reduce((a, b) => a + b, 0);
  const kindShare = (kind: PatrolSubject) =>
    isTravellerKind(kind) ? travellerShare * share(travellerRules.kinds, kind) : (1 - travellerShare) * share(patrolRules.kindWeights, kind);
  const rollShare = (kind: PatrolSubject, roll: TierRoll) => (isTravellerKind(kind) ? (roll === 'current' ? 1 : 0) : share(patrolRules.tierWeights, roll));
  const perKindRoll = Object.fromEntries(
    KINDS.map((kind) => [kind, Object.fromEntries(ROLLS.map((roll) => [roll, total * kindShare(kind) * rollShare(kind, roll)]))]),
  ) as Record<PatrolSubject, Record<TierRoll, number>>;
  return {
    perMinute: Object.fromEntries(KINDS.map((kind) => [kind, ROLLS.reduce((sum, roll) => sum + perKindRoll[kind][roll], 0)])) as Record<PatrolSubject, number>,
    byTierRoll: Object.fromEntries(ROLLS.map((roll) => [roll, KINDS.reduce((sum, kind) => sum + perKindRoll[kind][roll], 0)])) as Record<TierRoll, number>,
    perKindRoll,
    examples,
  };
}
