import { createInitialSave, type SaveData } from '../save';
import { buildingBadge } from './badges';
import type { Building } from './types';

const HOUR = 3_600_000;
const now = 1_800_000_000_000;
const origin = { latitude: -41.2865, longitude: 174.7762 };

const building = (extra: Partial<Building> = {}): Building => ({
  id: 'b1',
  kind: 'farm',
  siteId: 's1',
  position: origin,
  quality: 2,
  builtAt: now - HOUR,
  expiresAt: now + 100 * HOUR,
  heroId: 'bram',
  postedAt: now - HOUR,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
  ...extra,
});

/** A save where the building is posted, on the route, and the cart is running. */
const running = (b: Building): SaveData => {
  const base = createInitialSave();
  const loop = { n: 1, startedAt: now - HOUR, endsAt: now + HOUR, events: [] } as unknown as NonNullable<SaveData['supply']['cart']['loop']>;
  return { ...base, supply: { ...base.supply, buildings: [b], cart: { ...base.supply.cart, route: [{ building: b.id }], loop } } };
};

describe('a network marker’s badge', () => {
  it('is none when the building is worked, collected and has room', () => {
    expect(buildingBadge(running(building()), building(), now)).toBeNull();
  });

  it('says no worker, then nothing collecting it, then full, then the last day, each over the one before', () => {
    const b = building({ heroId: null, postedAt: null });
    expect(buildingBadge(running(b), b, now)).toBe('nowork');

    const parked = running(b);
    const off = { ...parked, supply: { ...parked.supply, cart: { ...parked.supply.cart, loop: null } } };
    expect(buildingBadge(off, b, now)).toBe('idle');

    const full = building({ heroId: null, postedAt: null, stock: { grain: 999 } });
    expect(buildingBadge(running(full), full, now)).toBe('full');

    const last = building({ heroId: null, postedAt: null, stock: { grain: 999 }, expiresAt: now + 2 * HOUR });
    expect(buildingBadge(running(last), last, now)).toBe('last');
  });

  it('puts a coming raid above everything', () => {
    const b = building({ expiresAt: now + 2 * HOUR });
    const save = running(b);
    // A raid a minute from landing is announced whatever the lead time.
    const raid = { buildingId: b.id, kind: 'bandits', tier: 1, landsAt: now + 60_000, defenders: [], result: null } as unknown as SaveData['supply']['raid'];
    expect(buildingBadge({ ...save, supply: { ...save.supply, raid } }, b, now)).toBe('raid');
  });
});
