import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import { emptyLoot } from '../loot/types';
import { emptySupply } from './state';
import type { Building } from './types';
import type { Order } from './orders';
import { plannerStops, suggestOrder } from './planner';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const DAY = 24 * 3_600_000;

const buildingAt = (position: LatLng, id: string, kind: Building['kind'] = 'farm'): Building => ({
  id,
  kind,
  siteId: `site-${id}`,
  position,
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
});

const orderWants = (placeId: string, wants: Order['wants']): Order => ({
  placeId,
  kind: 'tavern',
  wants,
  total: 10,
  delivered: {},
  goldFraction: 0,
  goldPaid: 0,
  steps: [],
  headline: emptyLoot(),
  expiresAt: now + 5 * DAY,
});

/** A save with the hall at the origin and the given buildings and orders. */
const saveWith = (buildings: Building[], orders: Record<string, Order> = {}): SaveData => ({
  ...createInitialSave(),
  supply: {
    ...emptySupply(now),
    hall: { cell: cellAt(origin), moves: [] },
    buildings,
    orders,
    discovered: Object.fromEntries(Object.keys(orders).map((id) => [id, now + 5 * DAY])),
  },
});

describe('suggestOrder', () => {
  it('visits a building before the place it serves, even when the place is nearer', () => {
    const farm = buildingAt(offsetPosition(origin, 300, 0), 'b1');
    const save = saveWith([farm], { p1: orderWants('p1', { grain: 10 }) });
    const route = [{ place: 'p1', position: offsetPosition(origin, 100, 0) } as const, { building: 'b1' } as const];
    expect(suggestOrder(save, [...route])).toEqual([{ building: 'b1' }, { place: 'p1', position: offsetPosition(origin, 100, 0) }]);
  });

  it('orders a route of places only nearest-next from the hall', () => {
    const save = saveWith([]);
    const near = offsetPosition(origin, 100, 0);
    const far = offsetPosition(origin, 400, 90);
    expect(suggestOrder(save, [{ place: 'far', position: far }, { place: 'near', position: near }])).toEqual([
      { place: 'near', position: near },
      { place: 'far', position: far },
    ]);
  });

  it('holds a market back until any building has been visited, and keeps via points at the end', () => {
    const quarry = buildingAt(offsetPosition(origin, 300, 0), 'b1', 'quarry');
    const save = saveWith([quarry], { m1: orderWants('m1', null) });
    const via = offsetPosition(origin, 50, 180);
    const market = offsetPosition(origin, 100, 0);
    expect(suggestOrder(save, [{ place: 'm1', position: market }, { via }, { building: 'b1' }])).toEqual([
      { building: 'b1' },
      { place: 'm1', position: market },
      { via },
    ]);
  });

  it('never adds or removes a stop, and returns the route as it is with no hall', () => {
    const save = saveWith([]);
    const route: Parameters<typeof suggestOrder>[1] = [{ place: 'p1', position: origin }];
    expect(suggestOrder(save, route)).toEqual(route);
    expect(suggestOrder({ ...save, supply: { ...save.supply, hall: null } }, route)).toEqual(route);
  });
});

describe('plannerStops', () => {
  it('lists the buildings within the hall’s reach, and not one beyond it', () => {
    const save = saveWith([buildingAt(offsetPosition(origin, 300, 0), 'b1'), buildingAt(offsetPosition(origin, 30_000, 0), 'b2')]);
    // The hall’s cell centre is what the reach is measured from, not the origin.
    const stops = plannerStops(save, now).filter((stop) => stop.kind === 'building');
    expect(stops.map((stop) => (stop.kind === 'building' ? stop.building.id : ''))).toEqual(['b1']);
  });
});
