import { placeRules } from '@/content/places';
import { tavernRules } from '@/content/taverns';

import { localDayStart } from '../generation/localDays';
import { distanceMeters, offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { placeGroupOf, placesWithin } from '../places/generate';
import { createInitialSave, type SaveData } from '../save';
import { checkPersonalTavern, personalTavernSpots, personalTaverns, tavernPeriod, tavernPeriodEnd } from './personal';
import { tavernOffers } from './taverns';

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
  it('creates one when no world tavern is within reach of the period\'s first position', () => {
    const save = unlocked();
    const spots = personalTavernSpots(save, farOrigin, now);
    // The check draws its own spot objects, so the unsnappable first spot is matched by value.
    const first = spots[0];
    const snapped = (p: LatLng) =>
      p.latitude === first.latitude && p.longitude === first.longitude ? null : offsetPosition(p, 10, 0);
    const next = checkPersonalTavern(save, farOrigin, now, snapped);
    const spot = next.personalTavern?.spot;
    expect(next.personalTavern?.period).toBe(tavernPeriod(now));
    expect(spot?.id).toBe(`tavern:personal:${save.playerSeed}:${tavernPeriod(now)}`);
    // The first spot that snapped wins, 10 m off its raw point (the raw first spot cannot snap).
    expect(spots.slice(1).map((p) => offsetPosition(p, 10, 0))).toContainEqual(spot?.position);
    const distance = distanceMeters(farOrigin, spot!.position);
    expect(distance).toBeGreaterThanOrEqual(tavernRules.personal.meters[0]);
    expect(distance).toBeLessThanOrEqual(tavernRules.personal.meters[1]);
    // The check is seeded: same save, same origin, same period, same result.
    expect(checkPersonalTavern(save, farOrigin, now, snapped)).toEqual(next);
    // Another player gets their own spot.
    const other = checkPersonalTavern(unlocked('seed-b'), farOrigin, now, (p) => p);
    expect(other.personalTavern?.spot?.position).not.toEqual(next.personalTavern?.spot?.position);
  });

  it('records a null spot when a world tavern is already within reach', () => {
    const save = unlocked();
    const next = checkPersonalTavern(save, nearOrigin, now, (p) => p);
    expect(next.personalTavern).toEqual({ period: tavernPeriod(now), spot: null });
    expect(personalTaverns(next, now)).toEqual([]);
  });

  it('leaves locked or unrevealed saves untouched', () => {
    const locked = unlocked('seed-a', { stats: { patrolsWon: 0, questsDone: 0, expeditionsLaunched: 0 } });
    expect(checkPersonalTavern(locked, farOrigin, now, (p) => p)).toBe(locked);
    const fresh = createInitialSave('seed-a');
    const unrevealed = unlocked('seed-a', { tutorial: { ...fresh.tutorial, step: 'gatherWood' } });
    expect(checkPersonalTavern(unrevealed, farOrigin, now, (p) => p)).toBe(unrevealed);
  });

  it('runs once per period', () => {
    const save = unlocked();
    const next = checkPersonalTavern(save, farOrigin, now, (p) => p);
    // Same period, another position: unchanged.
    expect(checkPersonalTavern(next, nearOrigin, now, (p) => p)).toBe(next);
    // The next period the check runs again, and the old record shows nothing.
    const nextPeriod = tavernPeriodEnd(tavernPeriod(now)) + 1;
    const renewed = checkPersonalTavern(next, farOrigin, nextPeriod, (p) => p);
    expect(renewed.personalTavern?.period).toBe(tavernPeriod(nextPeriod));
    expect(personalTaverns(next, nextPeriod)).toEqual([]);
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

  it('spawns a named tavern that lives for its period', () => {
    const save = unlocked();
    const next = checkPersonalTavern(save, farOrigin, now, (p) => p);
    const [personal] = personalTaverns(next, now);
    expect(personal.kind).toBe('tavern');
    expect(personal.name).toMatch(/^The \w+ \w+$/);
    const period = tavernPeriod(now);
    expect(personal.startsAt).toBe(localDayStart(period * 2, placeRules.changeHourLocal));
    expect(personal.expiresAt).toBe(tavernPeriodEnd(period));
  });
});
