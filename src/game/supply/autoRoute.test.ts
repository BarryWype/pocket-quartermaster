import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { emptyLoot } from '../loot/types';
import type { PlaceSpawn } from '../places/generate';
import { createInitialSave, type SaveData } from '../save';
import { autoAddBuilding, autoAddStops, effectiveRoute, insertStop, placesForRoute, pruneRoute, restoreRoute } from './autoRoute';
import { buildingReach } from './buildings';
import type { Order } from './orders';
import { emptySupply } from './state';
import type { Building, RoutePoint, StreetPath } from './types';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const DAY = 24 * 3_600_000;

const buildingAt = (position: LatLng, id: string, kind: Building['kind'] = 'farm', expiresAt = now + 6 * DAY): Building => ({
  id,
  kind,
  siteId: `site-${id}`,
  position,
  quality: 2,
  builtAt: now,
  expiresAt,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
});

const orderWants = (placeId: string, wants: Order['wants'], expiresAt = now + 5 * DAY): Order => ({
  placeId,
  kind: 'tavern',
  wants,
  total: 10,
  delivered: {},
  goldFraction: 0,
  goldPaid: 0,
  steps: [],
  headline: emptyLoot(),
  expiresAt,
});

const saveWith = (buildings: Building[], orders: Record<string, Order> = {}, route: RoutePoint[] = []): SaveData => {
  const save = createInitialSave();
  return {
    ...save,
    supply: {
      ...emptySupply(now),
      hall: { cell: cellAt(origin), moves: [] },
      buildings,
      orders,
      discovered: Object.fromEntries(Object.keys(orders).map((id) => [id, now + 5 * DAY])),
      cart: { ...emptySupply(now).cart, route },
    },
  };
};

const placeSpawn = (id: string, position: LatLng): PlaceSpawn => ({ id, kind: 'tavern', position, startsAt: now - DAY, expiresAt: now + 5 * DAY }) as PlaceSpawn;

const east = (m: number) => offsetPosition(origin, 0, m);
const west = (m: number) => offsetPosition(origin, 0, -m);

describe('insertStop', () => {
  it('puts a new building in the slot that adds the least distance, keeping the other stops in order', () => {
    const save = saveWith([buildingAt(east(100), 'b1'), buildingAt(east(300), 'b2'), buildingAt(east(200), 'b3')]);
    expect(insertStop(save, [{ building: 'b1' }, { building: 'b2' }], { building: 'b3' })).toEqual([{ building: 'b1' }, { building: 'b3' }, { building: 'b2' }]);
  });

  it('puts a place after every building of the route that makes what it wants, even when nearer', () => {
    const save = saveWith([buildingAt(east(300), 'b1')], { p1: orderWants('p1', { grain: 10 }) });
    expect(insertStop(save, [{ building: 'b1' }], { place: 'p1', position: east(100) })).toEqual([
      { building: 'b1' },
      { place: 'p1', position: east(100) },
    ]);
  });

  it('puts a building before the first place it serves', () => {
    const save = saveWith([buildingAt(west(100), 'b1', 'quarry'), buildingAt(east(300), 'b2')], { p1: orderWants('p1', { grain: 10 }) });
    const place = { place: 'p1', position: east(100) };
    expect(insertStop(save, [{ building: 'b1' }, place], { building: 'b2' })).toEqual([{ building: 'b1' }, { building: 'b2' }, place]);
  });
});

describe('autoAddStops', () => {
  it('makes the first route out of the first building: hall → building → hall', () => {
    const save = saveWith([buildingAt(east(150), 'b1')]);
    const { save: next, added, before } = autoAddBuilding(save, 'b1', now);
    expect(added).toEqual([{ building: 'b1' }]);
    expect(before).toEqual({ route: [], path: null });
    expect(next.supply.cart.route).toEqual([{ building: 'b1' }]);
    expect(next.supply.cart.path?.stopAt).toHaveLength(1);
  });

  it('changes nothing for a stop already on the route or beyond the hall’s reach', () => {
    const far = buildingReach(createInitialSave()).meters + 200;
    const save = saveWith([buildingAt(east(150), 'b1'), buildingAt(east(far), 'b2')], {}, [{ building: 'b1' }]);
    expect(autoAddBuilding(save, 'b1', now).added).toEqual([]);
    expect(autoAddBuilding(save, 'b2', now).save).toBe(save);
  });

  it('adds to the route waiting for the next departure while a loop runs', () => {
    const save = saveWith([buildingAt(east(150), 'b1'), buildingAt(west(150), 'b2')], {}, [{ building: 'b1' }]);
    const running: SaveData = {
      ...save,
      supply: { ...save.supply, cart: { ...save.supply.cart, loop: { n: 1, startedAt: now, endsAt: now + DAY, points: [], speedMps: 1, capacity: 10, events: [], unloaded: [] } } },
    };
    const { save: next } = autoAddBuilding(running, 'b2', now);
    expect(next.supply.cart.route).toEqual([{ building: 'b1' }]);
    expect(next.supply.cart.nextRoute).toEqual(expect.arrayContaining([{ building: 'b1' }, { building: 'b2' }]));
  });
});

describe('placesForRoute', () => {
  it('takes only the places with a live order that a building on the route makes something for', () => {
    const save = saveWith(
      [buildingAt(east(150), 'b1'), buildingAt(west(150), 'b2', 'quarry')],
      { grain: orderWants('grain', { grain: 10 }), stone: orderWants('stone', { stone: 10 }), market: orderWants('market', null), gone: orderWants('gone', { grain: 5 }, now - 1) },
      [{ building: 'b1' }],
    );
    const spawns = ['grain', 'stone', 'market', 'gone', 'none'].map((id, i) => placeSpawn(id, east(50 + i * 10)));
    expect(placesForRoute(save, spawns, now).map((point) => ('place' in point ? point.place : null))).toEqual(['grain', 'market']);
  });

  it('adds nothing while no building is on the route', () => {
    const save = saveWith([buildingAt(east(150), 'b1')], { grain: orderWants('grain', { grain: 10 }) });
    expect(placesForRoute(save, [placeSpawn('grain', east(60))], now)).toEqual([]);
  });

  it('a discovered place joins after its building, with the route before it kept for Undo', () => {
    const save = saveWith([buildingAt(east(300), 'b1')], { grain: orderWants('grain', { grain: 10 }) }, [{ building: 'b1' }]);
    const { save: next, before } = autoAddStops(save, placesForRoute(save, [placeSpawn('grain', east(100))], now), now);
    expect(effectiveRoute(next)).toEqual([{ building: 'b1' }, { place: 'grain', position: east(100) }]);
    expect(effectiveRoute(restoreRoute(next, before, now))).toEqual([{ building: 'b1' }]);
  });
});

describe('pruneRoute', () => {
  const path: StreetPath = { points: [origin, east(100), east(200), west(100), origin], stopAt: [1, 2, 3], straightLegs: [] };

  it('takes a gone building and an expired order off the route, keeping the path’s points', () => {
    const save = saveWith(
      [buildingAt(east(100), 'b1')],
      { late: orderWants('late', { grain: 5 }, now - 1) },
      [{ building: 'b1' }, { building: 'gone' }, { place: 'late', position: west(100) }],
    );
    const withPath = { ...save, supply: { ...save.supply, cart: { ...save.supply.cart, path } } };
    const { save: next, removed } = pruneRoute(withPath, now);
    expect(removed).toEqual([{ building: 'gone' }, { place: 'late', position: west(100) }]);
    expect(next.supply.cart.route).toEqual([{ building: 'b1' }]);
    expect(next.supply.cart.path).toEqual({ ...path, stopAt: [1] });
  });

  it('empties a route with no stop left, via points included', () => {
    const save = saveWith([], {}, [{ building: 'gone' }, { via: east(50) }]);
    const { save: next, removed } = pruneRoute(save, now);
    expect(removed).toEqual([{ building: 'gone' }]);
    expect(next.supply.cart.route).toEqual([]);
    expect(next.supply.cart.path).toBeNull();
  });

  it('changes nothing when every stop is live', () => {
    const save = saveWith([buildingAt(east(100), 'b1')], {}, [{ building: 'b1' }]);
    expect(pruneRoute(save, now).save).toBe(save);
  });
});

describe('restoreRoute', () => {
  it('an Undo of the first route parks the cart with no route', () => {
    const save = saveWith([buildingAt(east(150), 'b1')]);
    const { save: next, before } = autoAddBuilding(save, 'b1', now);
    expect(restoreRoute(next, before, now).supply.cart.route).toEqual([]);
  });
});
