import { cellAt } from '../discovery/cells';
import { createInitialSave, type SaveData } from '../save';
import { ageNetwork } from './debug';
import { emptySupply } from './state';
import type { Building } from './types';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const building = (extra: Partial<Building> = {}): Building => ({
  id: 'b1',
  kind: 'farm',
  siteId: 's1',
  position: origin,
  quality: 2,
  builtAt: now,
  expiresAt: now + 6 * DAY,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: now + HOUR,
  closedUntil: now + 2 * HOUR,
  ...extra,
});

/** A save with one of everything that carries a time. */
const networked = (): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    supply: {
      ...emptySupply(now),
      hall: { cell: cellAt(origin), moves: [now - DAY] },
      buildings: [building({ heroId: 'bram', postedAt: now })],
      cart: {
        ...emptySupply(now).cart,
        settledAt: now,
        route: [{ building: 'b1' }],
        loop: { n: 1, startedAt: now, endsAt: now + HOUR, points: [], speedMps: 1, capacity: 20, events: [{ at: now + 30 * 60_000, kind: 'building', buildingId: 'b1' }], unloaded: [] },
        log: [{ n: 1, endedAt: now - HOUR, delivered: {}, places: [], ambush: null }],
      },
      raid: { buildingId: 'b1', kind: 'goblins', tier: 1, landsAt: now + 2 * HOUR, defenders: [{ heroId: 'bram', sentAt: now, arrivesAt: now + HOUR, returnsAt: now + 2 * HOUR }], result: null },
      raidLog: [{ buildingId: 'b1', landsAt: now - DAY, kind: 'goblins', won: true, lost: {} }],
      lastOpenAt: now - HOUR,
      discovered: { 'place:x': now + DAY },
    },
  };
};

describe('ageNetwork', () => {
  it('shifts every supply timestamp back by the span, keeping the rest', () => {
    const ms = 3 * DAY;
    const aged = ageNetwork(networked(), ms);
    const supply = aged.supply;
    expect(supply.hall!.moves).toEqual([now - DAY - ms]);
    const b = supply.buildings[0];
    expect(b.builtAt).toBe(now - ms);
    expect(b.expiresAt).toBe(now + 6 * DAY - ms);
    expect(b.postedAt).toBe(now - ms);
    expect(b.settledAt).toBe(now - ms);
    expect(b.inspectedUntil).toBe(now + HOUR - ms);
    expect(b.closedUntil).toBe(now + 2 * HOUR - ms);
    expect(supply.cart.settledAt).toBe(now - ms);
    expect(supply.cart.loop!.startedAt).toBe(now - ms);
    expect(supply.cart.loop!.endsAt).toBe(now + HOUR - ms);
    expect(supply.cart.loop!.events[0].at).toBe(now + 30 * 60_000 - ms);
    expect(supply.cart.log[0].endedAt).toBe(now - HOUR - ms);
    expect(supply.raid!.landsAt).toBe(now + 2 * HOUR - ms);
    expect(supply.raid!.defenders[0]).toMatchObject({ sentAt: now - ms, arrivesAt: now + HOUR - ms, returnsAt: now + 2 * HOUR - ms });
    expect(supply.raidLog[0].landsAt).toBe(now - DAY - ms);
    expect(supply.lastOpenAt).toBe(now - HOUR - ms);
    expect(supply.discovered).toEqual({ 'place:x': now + DAY });
    // Nothing but the times moved.
    expect(supply.buildings[0].id).toBe('b1');
    expect(supply.cart.route).toEqual([{ building: 'b1' }]);
  });

  it('keeps nulls null and empty states empty', () => {
    const aged = ageNetwork({ ...createInitialSave(), supply: emptySupply(now) }, DAY);
    expect(aged.supply.hall).toBeNull();
    expect(aged.supply.buildings).toEqual([]);
    expect(aged.supply.cart.loop).toBeNull();
    expect(aged.supply.raid).toBeNull();
    expect(aged.supply.personalSite).toBeNull();
  });
});
