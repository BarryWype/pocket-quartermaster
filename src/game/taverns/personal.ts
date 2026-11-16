import { placeRules } from '@/content/places';
import { tavernRules } from '@/content/taverns';

import { distanceMeters, offsetPosition } from '../generation/geo';
import { localDayIndex, localDayStart } from '../generation/localDays';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { placeGroupOf, placesWithin } from '../places/generate';
import { isRevealed } from '../reveal/reveal';
import type { SaveData } from '../save';
import { isTavernUnlocked, withTavernName, type TavernSpawn } from './taverns';

type Rules = typeof tavernRules;

/**
 * The personal tavern's period: two local days, so it ends at the next group
 * change (see places/generate.ts).
 */
export function tavernPeriod(now: number): number {
  return Math.floor(localDayIndex(now, placeRules.changeHourLocal) / 2);
}

/** When the period ends: the change hour on the local day after its two days. */
export function tavernPeriodEnd(period: number): number {
  return localDayStart((period + 1) * 2, placeRules.changeHourLocal);
}

/**
 * The period's candidate spots for the personal tavern: seeded by player seed
 * and period, so a period's check is stable however often the map opens.
 */
export function personalTavernSpots(save: SaveData, origin: LatLng, now: number, rules: Rules = tavernRules): LatLng[] {
  const rng = createRng(`personal-tavern|${save.playerSeed}|${tavernPeriod(now)}`);
  return Array.from({ length: rules.personal.tries }, () => {
    const bearing = rng.next() * 2 * Math.PI;
    const distance = rng.int(...rules.personal.meters);
    return offsetPosition(origin, Math.cos(bearing) * distance, Math.sin(bearing) * distance);
  });
}

/**
 * The period's tavern guarantee: the period's first map position either has a
 * world tavern within `guaranteeMeters`, or gets a personal one on the first
 * candidate spot that snaps (via `snap`, null when it cannot) onto a walkable
 * place within its band — the first raw spot when none does. Ran once per
 * period; returns the same save when nothing changes.
 */
export function checkPersonalTavern(
  save: SaveData,
  origin: LatLng,
  now: number,
  snap: (point: LatLng) => LatLng | null,
  rules: Rules = tavernRules,
): SaveData {
  const period = tavernPeriod(now);
  if (!isTavernUnlocked(save, rules) || !isRevealed(save, 'taverns') || save.personalTavern?.period === period) return save;
  const worldNear = placesWithin(origin, rules.guaranteeMeters, now, [placeGroupOf('tavern')]).some(
    (spawn) => spawn.kind === 'tavern' && spawn.startsAt <= now && now < spawn.expiresAt,
  );
  if (worldNear) return { ...save, personalTavern: { period, spot: null } };
  const spots = personalTavernSpots(save, origin, now, rules);
  const id = `tavern:personal:${save.playerSeed}:${period}`;
  for (const spot of spots) {
    const position = snap(spot);
    if (position === null) continue;
    const distance = distanceMeters(origin, position);
    if (distance >= rules.personal.meters[0] && distance <= rules.personal.meters[1]) {
      return { ...save, personalTavern: { period, spot: { id, position } } };
    }
  }
  return { ...save, personalTavern: { period, spot: { id, position: spots[0] } } };
}

/** The personal tavern of the period, while its check's spot is set: it lives until the period ends. */
export function personalTaverns(save: SaveData, now: number, rules: Rules = tavernRules): TavernSpawn[] {
  const { spot, period } = save.personalTavern ?? {};
  if (!spot || period !== tavernPeriod(now) || !isTavernUnlocked(save, rules) || !isRevealed(save, 'taverns')) return [];
  return [
    withTavernName({
      id: spot.id,
      kind: 'tavern',
      group: placeGroupOf('tavern').id,
      tile: 'personal',
      position: spot.position,
      startsAt: localDayStart(period * 2, placeRules.changeHourLocal),
      expiresAt: tavernPeriodEnd(period),
      roll: 0,
    }),
  ];
}
