import { tavernRules } from '@/content/taverns';

import { nextRotationAt, rotationDay } from '../dungeons/rotation';
import { distanceMeters, offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { placeGroupOf, placesWithin } from '../places/generate';
import { createInitialSave, type SaveData } from '../save';
import { checkPersonalTavern, personalTavernSpots, personalTaverns } from './personal';
import { tavernOffers } from './taverns';

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 26, 12);
const base = { latitude: -41.2865, longitude: 174.7762 };

const unlocked = (seed = 'seed-a', extra: Partial<SaveData> = {}): SaveData => {
  const save = createInitialSave(seed);
  return { ...save, tutorial: { ...save.tutorial, step: 'done' }, stats: { patrolsWon: 0, questsDone: 1, expeditionsLaunched: 0 }, ...extra };
};

const worldTavernNear = (origin: LatLng, at: number) =>
  placesWithin(origin, tavernRules.guaranteeMeters, at, [placeGroupOf('tavern')]).some(
    (spawn) => spawn.kind === 'tavern' && spawn.startsAt <= at && at < spawn.expiresAt,
  );

// A walk over nearby origins: one with no world tavern in the guarantee band, one with one.
const origins = Array.from({ length: 60 }, (_, i) => offsetPosition(base, (i % 9) * 211, i * 97));
const farOrigin = origins.find((origin) => !worldTavernNear(origin, now))!;
const nearOrigin = origins.find((origin) => worldTavernNear(origin, now))!;

describe('the personal tavern guarantee', () => {
  it('creates one when no world tavern is within reach of the day\'s first position', () => {
    const save = unlocked();
    const spots = personalTavernSpots(save, farOrigin, now);
    const snapped = (p: LatLng) => (p === spots[0] ? null : offsetPosition(p, 10, 0));
    const next = checkPersonalTavern(save, farOrigin, now, snapped);
    const spot = next.personalTavern?.spot;
    expect(next.personalTavern?.day).toBe(rotationDay(now));
    expect(spot?.id).toBe(`tavern:personal:${save.playerSeed}:${rotationDay(now)}`);
    // The first spot that snapped wins, 10 m off its raw point.
    expect(spot?.position).toEqual(offsetPosition(spots[1], 10, 0));
    const distance = distanceMeters(farOrigin, spot!.position);
    expect(distance).toBeGreaterThanOrEqual(tavernRules.personal.meters[0]);
    expect(distance).toBeLessThanOrEqual(tavernRules.personal.meters[1]);
    // The check is seeded: same save, same origin, same day, same result.
    expect(checkPersonalTavern(save, farOrigin, now, snapped)).toEqual(next);
    // Another player gets their own spot.
    const other = checkPersonalTavern(unlocked('seed-b'), farOrigin, now, (p) => p);
    expect(other.personalTavern?.spot?.position).not.toEqual(next.personalTavern?.spot?.position);
  });

  it('records a null spot when a world tavern is already within reach', () => {
    const save = unlocked();
    const next = checkPersonalTavern(save, nearOrigin, now, (p) => p);
    expect(next.personalTavern).toEqual({ day: rotationDay(now), spot: null });
    expect(personalTaverns(next, now)).toEqual([]);
  });

  it('leaves locked or unrevealed saves untouched', () => {
    const locked = unlocked('seed-a', { stats: { patrolsWon: 0, questsDone: 0, expeditionsLaunched: 0 } });
    expect(checkPersonalTavern(locked, farOrigin, now, (p) => p)).toBe(locked);
    const fresh = createInitialSave('seed-a');
    const unrevealed = unlocked('seed-a', { tutorial: { ...fresh.tutorial, step: 'gatherWood' } });
    expect(checkPersonalTavern(unrevealed, farOrigin, now, (p) => p)).toBe(unrevealed);
  });

  it('runs once per rotation day', () => {
    const save = unlocked();
    const next = checkPersonalTavern(save, farOrigin, now, (p) => p);
    // Same day, another position: unchanged.
    expect(checkPersonalTavern(next, nearOrigin, now, (p) => p)).toBe(next);
    // The next day the check runs again, and yesterday's field shows nothing.
    const nextDay = now + DAY;
    const renewed = checkPersonalTavern(next, farOrigin, nextDay, (p) => p);
    expect(renewed.personalTavern?.day).toBe(rotationDay(nextDay));
    expect(personalTaverns(next, nextDay)).toEqual([]);
  });

  it('offers recruits like any tavern', () => {
    const save = unlocked();
    const next = checkPersonalTavern(save, farOrigin, now, (p) => p);
    const personal = personalTaverns(next, now)[0];
    expect(personal).toBeDefined();
    expect(tavernOffers(next, personal.id, now)).toEqual(tavernOffers(next, personal.id, now));
    const world = placesWithin(nearOrigin, tavernRules.guaranteeMeters, now, [placeGroupOf('tavern')]).find(
      (spawn) => spawn.kind === 'tavern' && spawn.startsAt <= now && now < spawn.expiresAt,
    )!;
    const own = tavernOffers(next, personal.id, now);
    const worlds = tavernOffers(next, world.id, now);
    expect(own.map((offer) => offer.level)).toEqual(worlds.map((offer) => offer.level));
    expect(own.length).toBe(worlds.length);
  });

  it('spawns a named tavern that lasts until the rotation reset', () => {
    const save = unlocked();
    const next = checkPersonalTavern(save, farOrigin, now, (p) => p);
    const [personal] = personalTaverns(next, now);
    expect(personal.kind).toBe('tavern');
    expect(personal.name).toMatch(/^The \w+ \w+$/);
    expect(personal.expiresAt).toBe(nextRotationAt(now));
  });
});
