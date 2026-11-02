import { tavernRules } from '@/content/taverns';

import { nextRotationAt, rotationDay } from '../dungeons/rotation';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { placeGroupOf, placesWithin } from '../places/generate';
import { isRevealed } from '../reveal/reveal';
import type { SaveData } from '../save';
import { isTavernUnlocked, withTavernName, type TavernSpawn } from './taverns';

type Rules = typeof tavernRules;

const DAY_MS = 86_400_000;

/**
 * The day's candidate spots for the personal tavern: seeded by player seed and
 * rotation day, so a day's check is stable however often the map opens.
 */
export function personalTavernSpots(save: SaveData, origin: LatLng, now: number, rules: Rules = tavernRules): LatLng[] {
  const rng = createRng(`personal-tavern|${save.playerSeed}|${rotationDay(now)}`);
  return Array.from({ length: rules.personal.tries }, () => {
    const bearing = rng.next() * 2 * Math.PI;
    const distance = rng.int(...rules.personal.meters);
    return offsetPosition(origin, Math.cos(bearing) * distance, Math.sin(bearing) * distance);
  });
}

/**
 * The day's tavern guarantee: the day's first map position either has a world
 * tavern within `guaranteeMeters`, or gets a personal one on the first
 * candidate spot that snaps (via `snap`, null when it cannot) onto a walkable
 * place within its band — the first raw spot when none does. Ran once per
 * rotation day; returns the same save when nothing changes.
 */
export function checkPersonalTavern(
  save: SaveData,
  origin: LatLng,
  now: number,
  snap: (point: LatLng) => LatLng | null,
  rules: Rules = tavernRules,
): SaveData {
  const day = rotationDay(now);
  if (!isTavernUnlocked(save, rules) || !isRevealed(save, 'taverns') || save.personalTavern?.day === day) return save;
  const worldNear = placesWithin(origin, rules.guaranteeMeters, now, [placeGroupOf('tavern')]).some(
    (spawn) => spawn.kind === 'tavern' && spawn.startsAt <= now && now < spawn.expiresAt,
  );
  if (worldNear) return { ...save, personalTavern: { day, spot: null } };
  const spots = personalTavernSpots(save, origin, now, rules);
  const id = `tavern:personal:${save.playerSeed}:${day}`;
  for (const spot of spots) {
    const position = snap(spot);
    if (position === null) continue;
    const distance = distanceMeters(origin, position);
    if (distance >= rules.personal.meters[0] && distance <= rules.personal.meters[1]) {
      return { ...save, personalTavern: { day, spot: { id, position } } };
    }
  }
  return { ...save, personalTavern: { day, spot: { id, position: spots[0] } } };
}

/** The personal tavern of the day, while its check's spot is set: it lives until the rotation reset. */
export function personalTaverns(save: SaveData, now: number, rules: Rules = tavernRules): TavernSpawn[] {
  const { spot, day } = save.personalTavern ?? {};
  if (!spot || day !== rotationDay(now) || !isTavernUnlocked(save, rules) || !isRevealed(save, 'taverns')) return [];
  return [
    withTavernName({
      id: spot.id,
      kind: 'tavern',
      group: placeGroupOf('tavern').id,
      tile: 'personal',
      position: spot.position,
      startsAt: nextRotationAt(now) - DAY_MS,
      expiresAt: nextRotationAt(now),
      roll: 0,
    }),
  ];
}
