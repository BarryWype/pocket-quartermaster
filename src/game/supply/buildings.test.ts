import { placeRules } from '@/content/places';
import { supplyRules } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import { build, buildCost, buildProblem, buildingReach, isLastDay, timeLeftShare, TIME_LEFT_STEPS } from './buildings';
import { emptySupply } from './state';
import type { Building } from './types';
import type { PlaceSpawn } from '../places/generate';

const origin: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const site = (extra: Partial<PlaceSpawn> = {}): PlaceSpawn => ({
  id: 'site:x',
  kind: 'site',
  group: 'site',
  tile: 't',
  position: offsetPosition(origin, 400, 0),
  startsAt: now - HOUR,
  expiresAt: now + 6 * DAY,
  roll: 0.2,
  ...extra,
});

/** A save that can build: a hall at the origin, the site discovered, the cost in hand. */
const ready = (buildings: Building[] = []): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    gold: buildCost(base).gold,
    materials: { ...base.materials, wood: buildCost(base).materials[0].amount },
    supply: { ...emptySupply(now), hall: { cell: cellAt(origin), moves: [] }, buildings, discovered: { 'site:x': now + 6 * DAY } },
  };
};

describe('buildProblem', () => {
  it('refuses in order: no hall, then an undiscovered site', () => {
    const noHall = ready();
    expect(buildProblem({ ...noHall, supply: { ...noHall.supply, hall: null } }, site(), 'farm', origin, now)).toBe('noHall');
    const hallOnly = { ...ready(), supply: { ...ready().supply, discovered: {} } };
    expect(buildProblem(hallOnly, site(), 'farm', origin, now)).toBe('notDiscovered');
  });

  it('refuses a site already built on', () => {
    const taken = ready([{ id: 'b1', kind: 'farm', siteId: 'site:x' } as Building]);
    expect(buildProblem(taken, site(), 'farm', origin, now)).toBe('taken');
  });

  it('refuses a site out of the hall’s reach before the count is full', () => {
    const far = ready();
    const farSite = site({ position: offsetPosition(origin, buildingReach(far).meters + 100, 0) });
    expect(buildProblem(far, farSite, 'farm', origin, now)).toBe('tooFarFromHall');
    // The same site with the hall beside it is fine: the problem was the distance.
    const near = { ...far, supply: { ...far.supply, hall: { cell: cellAt(farSite.position), moves: [] } } };
    expect(buildProblem(near, farSite, 'farm', farSite.position, now)).toBeNull();
  });

  it('refuses once the tier’s count of buildings stands', () => {
    const reach = buildingReach(ready());
    const buildings = Array.from({ length: reach.count }, (_, i) => ({
      id: `b${i}`,
      kind: 'farm',
      siteId: `site:${i}`,
      position: origin,
      quality: 1,
      builtAt: now,
      expiresAt: now + 6 * DAY,
      heroId: null,
      postedAt: null,
      stock: {},
      progress: 0,
      made: 0,
      settledAt: now,
      inspectedUntil: 0,
      closedUntil: 0,
    })) as Building[];
    const full = ready(buildings);
    expect(buildProblem(full, site(), 'farm', origin, now)).toBe('full');
    const oneShort = ready(buildings.slice(1));
    expect(buildProblem(oneShort, site(), 'farm', site().position, now)).toBeNull();
  });

  it('refuses a site the player does not stand at, and a cost the player cannot pay', () => {
    const save = ready();
    expect(buildProblem(save, site(), 'farm', offsetPosition(site().position, placeRules.interactionMeters + 10, 0), now)).toBe('notHere');
    const poor = { ...save, gold: 0 };
    expect(buildProblem(poor, site(), 'farm', site().position, now)).toBe('cost');
    const noWood = { ...save, materials: {} };
    expect(buildProblem(noWood, site(), 'farm', site().position, now)).toBe('cost');
  });
});

describe('build', () => {
  it('pays the cost, takes the site’s quality and position, and resets its life to six days', () => {
    const save = ready();
    const built = build(save, site({ roll: 0.6 }), 'farm', site().position, now);
    const building = built.supply.buildings.at(-1)!;
    expect(building).toMatchObject({ kind: 'farm', siteId: 'site:x', quality: 2, position: site().position, builtAt: now });
    expect(building.expiresAt).toBe(now + supplyRules.buildings.lifeDays * DAY);
    expect(built.gold).toBe(0);
    expect(built.materials.wood ?? 0).toBe(0);
    expect(built.supply.nextId).toBe(save.supply.nextId + 1);
  });

  it('throws on any problem, and free skips only standing elsewhere and the cost', () => {
    const save = ready();
    expect(() => build(save, site(), 'farm', offsetPosition(origin, 5000, 0), now)).toThrow(/notHere/);
    const poor = { ...save, gold: 0, materials: {} };
    expect(() => build(poor, site(), 'farm', site().position, now)).toThrow(/cost/);
    // Free builds from anywhere without paying, but never past the other problems.
    const free = build(poor, site(), 'farm', offsetPosition(origin, 5000, 0), now, { free: true });
    expect(free.supply.buildings.at(-1)!.quality).toBe(1);
    expect(free.gold).toBe(0);
    const taken = ready([{ id: 'b1', kind: 'farm', siteId: 'site:x' } as Building]);
    expect(() => build(taken, site(), 'farm', origin, now, { free: true })).toThrow(/taken/);
  });
});

describe('buildingReach', () => {
  it('follows the highest unlocked tier, with the configured counts and reaches', () => {
    const save = ready();
    expect(buildingReach(save)).toEqual(supplyRules.buildings.limits[1]);
    expect(supplyRules.buildings.limits).toEqual({
      1: { count: 3, meters: 1000 },
      2: { count: 3, meters: 1000 },
      3: { count: 4, meters: 1500 },
      4: { count: 5, meters: 2000 },
      5: { count: 6, meters: 2500 },
    });
  });
});

describe('isLastDay', () => {
  it('is true within the last day hours of a building’s life, and false before', () => {
    const expiresAt = now + 6 * DAY;
    expect(isLastDay(expiresAt, now)).toBe(false);
    expect(isLastDay(expiresAt, expiresAt - supplyRules.buildings.lastDayHours * HOUR)).toBe(true);
    expect(isLastDay(expiresAt, expiresAt)).toBe(true);
  });
});

describe('timeLeftShare', () => {
  const life = (days: number) => days * DAY;

  it('is the share of life left, clamped to 0 and 1', () => {
    expect(timeLeftShare(now, now + life(6), now + life(3))).toBe(0.5);
    expect(timeLeftShare(now, now + life(6), now - HOUR)).toBe(1);
    expect(timeLeftShare(now, now + life(6), now + life(7))).toBe(0);
    // A life already over has nothing left, whatever its start.
    expect(timeLeftShare(now + DAY, now, now)).toBe(0);
  });

  it('rounds to the ring’s steps, so two moments inside one step share a share', () => {
    const step = life(6) / TIME_LEFT_STEPS;
    // Just under and just over one step’s worth of life gone both land on the same share.
    expect(timeLeftShare(now, now + life(6), now + step * 0.9)).toBe(47 / TIME_LEFT_STEPS);
    expect(timeLeftShare(now, now + life(6), now + step * 1.1)).toBe(47 / TIME_LEFT_STEPS);
    // An unrounded share would be 0.49 and 0.51; the ring only moves at its steps.
    expect(timeLeftShare(now, now + life(6), now + life(3) * 1.02)).toBe(0.5);
    expect(timeLeftShare(now, now + life(6), now + life(3) * 0.98)).toBe(0.5);
  });
});
