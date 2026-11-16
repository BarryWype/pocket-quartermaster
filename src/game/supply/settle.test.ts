import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { isBusy, isPosted } from '../team/team';
import { setCrew, setRoute, startCart } from './cart';
import { settleNetwork } from './settle';
import { emptySupply } from './state';
import type { Building } from './types';

import { supplyRules } from '@/content/supplyLines';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const buildingIn = (extra: Partial<Building> = {}): Building => ({
  id: 'b1',
  kind: 'farm',
  siteId: 's1',
  position: offsetPosition(origin, 600, 0),
  quality: 2,
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
  ...extra,
});

const saveWith = (buildings: Building[], extra: Partial<SaveData['supply']> = {}): SaveData => ({
  ...createInitialSave(),
  supply: { ...emptySupply(now), hall: { cell: cellAt(origin), moves: [] }, buildings, ...extra },
});

describe('building expiry in settleNetwork', () => {
  beforeEach(() => {
    // No ambushes: the cart's cargo is what these tests watch.
    jest.replaceProperty(supplyRules.danger, 'ambushChance', [0, 0, 0, 0]);
  });
  afterEach(() => jest.restoreAllMocks());

  it('a cart call an hour before expiry carries the stock aboard and home', () => {
    // The building is 600 m out: the cart calls at 12 minutes, an hour before it expires.
    const expiresAt = now + 1.2 * HOUR;
    const save = saveWith([buildingIn({ stock: { grain: 10 }, expiresAt })]);
    const started = startCart(setRoute(setCrew(save, 'bram', [], now), [{ building: 'b1' }], now), now);
    const midLoop = settleNetwork(started, now + 15 * 60_000);
    expect(midLoop.supply.cart.cargo.grain).toBeGreaterThanOrEqual(10);
    // The loop finishes before the building goes, and the cargo aboard is delivered anyway.
    const done = settleNetwork(midLoop, expiresAt + 3 * HOUR);
    expect(done.supply.buildings).toEqual([]);
    expect(done.materials.grain).toBeGreaterThanOrEqual(10);
  });

  it('the stock left at expiry is lost, not paid into the materials', () => {
    const expiresAt = now + HOUR;
    const save = saveWith([buildingIn({ stock: { grain: 7 }, expiresAt })]);
    const done = settleNetwork(save, expiresAt + HOUR);
    expect(done.supply.buildings).toEqual([]);
    expect(done.materials.grain).toBeUndefined();
  });

  it('the posted hero is simply free again, and a raid on the building is dropped', () => {
    const expiresAt = now + HOUR;
    const save = saveWith([buildingIn({ kind: 'herbGarden', heroId: 'bram', postedAt: now, expiresAt })], {
      raid: { buildingId: 'b1', kind: 'goblins', tier: 1, landsAt: expiresAt + HOUR, defenders: [], result: null },
    });
    const done = settleNetwork(save, expiresAt + 2 * HOUR);
    expect(done.supply.buildings).toEqual([]);
    expect(isPosted(done, 'bram')).toBe(false);
    expect(isBusy(done, 'bram')).toBe(false);
    expect(done.supply.raid).toBeNull();
  });
});
