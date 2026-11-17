import { supplyRules } from '@/content/supplyLines';
import { materialPrices } from '@/content/shops';

import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import { emptyLoot } from '../loot/types';
import { createInitialSave, type SaveData } from '../save';
import { currentHp } from '../team/health';
import { isAway } from '../team/team';
import { emptySupply } from './state';
import type { Building, CartEvent } from './types';
import type { Order } from './orders';
import {
  cartCapacity,
  cartNextEventAt,
  cartPositionAt,
  cartProblem,
  cartSpeedMps,
  crewProblem,
  loopPreview,
  routeCells,
  routePreview,
  routeProblem,
  setCrew,
  setRoute,
  settleCart,
  startCart,
  stopCart,
  upcomingUnload,
} from './cart';

const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const HOUR = 3_600_000;
const MINUTE = 60_000;

const cellNear = (meters: number, bearing = 0) => cellAt(offsetPosition(origin, meters, bearing));

const buildingAt = (position: LatLng, id: string, stock: Record<string, number>): Building => ({
  id,
  kind: 'farm',
  siteId: `site-${id}`,
  position,
  quality: 2,
  builtAt: now,
  expiresAt: now + 6 * 24 * HOUR,
  heroId: null,
  postedAt: null,
  stock,
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
});

/** A save with the hall at the origin and two stocked buildings. */
const baseSave = (): SaveData => {
  const hallCell = cellNear(0);
  const buildings = [buildingAt(offsetPosition(origin, 300, 0), 'b1', { grain: 8 }), buildingAt(offsetPosition(origin, 600, 90), 'b2', { stone: 6 })];
  return { ...createInitialSave(), supply: { ...emptySupply(now), hall: { cell: hallCell, moves: [] }, buildings } };
};

const readySave = () => setRoute(setCrew(baseSave(), 'bram', ['lyra'], now), [{ building: 'b1' }, { building: 'b2' }], null, now);

beforeEach(() => {
  // No ambushes unless a test forces them.
  jest.replaceProperty(supplyRules.danger, 'ambushChance', [0, 0, 0, 0]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a full loop', () => {
  it('delivers the buildings’ stock up to capacity into materials, and logs it', () => {
    const started = startCart(readySave(), now);
    const loop = started.supply.cart.loop!;
    expect(loop.events.filter((event) => event.kind === 'building')).toHaveLength(2);
    const done = settleCart(started, loop.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === 1)!;
    const capacity = supplyRules.cart.capacity;
    const deliveredTotal = Object.values(line.delivered).reduce((sum, amount) => sum + amount, 0);
    expect(deliveredTotal).toBeLessThanOrEqual(capacity);
    expect(line.delivered.grain).toBeGreaterThanOrEqual(8);
    expect(line.delivered.stone).toBeGreaterThanOrEqual(6);
    expect(done.materials.grain).toBe((started.materials.grain ?? 0) + line.delivered.grain);
    expect(done.materials.stone).toBe((started.materials.stone ?? 0) + line.delivered.stone);
    expect(line.ambush).toBeNull();
    // The buildings were emptied into the cart.
    expect(done.supply.buildings.find((building) => building.id === 'b1')!.stock.grain ?? 0).toBeLessThan(1);
  });

  it('replays eight hours in one call exactly like settling every ten minutes', () => {
    const started = startCart(readySave(), now);
    const end = now + 8 * HOUR;
    const onePass = settleCart(started, end);
    let stepped = started;
    for (let t = now + 10 * MINUTE; t <= end; t += 10 * MINUTE) stepped = settleCart(stepped, t);
    expect(onePass).toEqual(stepped);
  });

  it('keeps the cargo of buildings already visited aboard when settled halfway', () => {
    const started = startCart(readySave(), now);
    const loop = started.supply.cart.loop!;
    const firstBuilding = loop.events.find((event) => event.kind === 'building')!;
    const half = settleCart(started, firstBuilding.at + 1);
    expect(half.supply.cart.loop).not.toBeNull();
    expect(half.supply.cart.cargo.grain).toBeGreaterThanOrEqual(8);
    const done = settleCart(half, loop.endsAt);
    expect(done.supply.cart.log.find((entry) => entry.n === 1)!.delivered.grain).toBeGreaterThanOrEqual(8);
  });

  it('applies a route changed mid-loop from the next departure', () => {
    const started = startCart(readySave(), now);
    const changed = setRoute(started, [{ building: 'b2' }], null, now);
    expect(changed.supply.cart.nextRoute).toEqual([{ building: 'b2' }]);
    const done = settleCart(changed, started.supply.cart.loop!.endsAt);
    expect(done.supply.cart.route).toEqual([{ building: 'b2' }]);
    expect(done.supply.cart.nextRoute).toBeNull();
    const nextLoop = done.supply.cart.loop!;
    expect(nextLoop.events.filter((event) => event.kind === 'building').map((event) => (event as { buildingId: string }).buildingId)).toEqual(['b2']);
  });

  it('loads nothing from a building removed while the cart is on its way, and the loop goes on', () => {
    const started = startCart(readySave(), now);
    const loop = started.supply.cart.loop!;
    const withoutB2: SaveData = { ...started, supply: { ...started.supply, buildings: started.supply.buildings.filter((building) => building.id !== 'b2') } };
    const done = settleCart(withoutB2, loop.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === 1)!;
    expect(line.delivered.stone ?? 0).toBe(0);
    expect(line.delivered.grain).toBeGreaterThanOrEqual(8);
  });

  it('keeps the stored path and the next stop\'s call time when an earlier building on the route is gone', () => {
    const ready = readySave();
    const withB1 = startCart(ready, now).supply.cart.loop!;
    const callAt = (loop: typeof withB1) => loop.events.find((event) => event.kind === 'building' && event.buildingId === 'b2')!.at;
    const withoutB1: SaveData = { ...ready, supply: { ...ready.supply, buildings: ready.supply.buildings.filter((building) => building.id !== 'b1') } };
    const loop = startCart(withoutB1, now).supply.cart.loop!;
    expect(loop.points).toEqual(withB1.points);
    expect(callAt(loop)).toBe(callAt(withB1));
    expect(loop.events.some((event) => event.kind === 'building' && event.buildingId === 'b1')).toBe(false);
  });
});

describe('ambushes', () => {
  it('a won ambush after a building keeps the cargo and pays its rewards and HP at loop end', () => {
    jest.restoreAllMocks();
    // Seed search over hall placements with a strong crew: the ambush roll is seeded per cell,
    // so moving the hall changes the crossed cells; find one with a won ambush after the first building.
    const strong = (save: SaveData): SaveData => ({
      ...save,
      heroes: save.heroes.map((hero) => ({ ...hero, level: 12, xp: 0, exhaustedUntil: 0 })),
    });
    const placed = (offset: number): SaveData => {
      const hallCell = cellNear(offset);
      const buildings = [buildingAt(offsetPosition(origin, offset + 300, 0), 'b1', { grain: 8 }), buildingAt(offsetPosition(origin, offset + 600, 90), 'b2', { stone: 6 })];
      const withBuildings: SaveData = { ...createInitialSave(), supply: { ...emptySupply(now), hall: { cell: hallCell, moves: [] }, buildings } };
      return setRoute(setCrew(withBuildings, 'bram', ['lyra', 'mira'], now), [{ building: 'b1' }, { building: 'b2' }], null, now);
    };
    let started = startCart(strong(placed(0)), now);
    let ambush: Extract<CartEvent, { kind: 'ambush' }> | undefined;
    for (let k = 0; k < 400 && !ambush; k++) {
      const candidate = startCart(strong(placed(k * 17)), now);
      const loop = candidate.supply.cart.loop!;
      const firstBuilding = loop.events.find((event) => event.kind === 'building');
      const found = loop.events.find((event) => event.kind === 'ambush' && event.won === true && firstBuilding && event.at > firstBuilding.at);
      if (found && found.kind === 'ambush') {
        started = candidate;
        ambush = found;
      }
    }
    expect(ambush).toBeDefined();
    const loop = started.supply.cart.loop!;
    // Halfway, after the building but before the ambush: the cargo is aboard.
    const half = settleCart(started, ambush!.at - 1);
    expect(Object.values(half.supply.cart.cargo).reduce((sum, amount) => sum + amount, 0)).toBeGreaterThan(0);
    const done = settleCart(half, loop.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === loop.n)!;
    expect(line.ambush).toEqual({ cell: ambush!.cell, kind: ambush!.patrolKind, won: true });
    // The cargo was not emptied: everything loaded before the ambush is delivered.
    expect(Object.values(line.delivered).reduce((sum, amount) => sum + amount, 0)).toBeGreaterThan(0);
    // The fight's HP was applied at loop end.
    const expected = done.heroes.map((hero) => ambush!.hp.find((h) => h.heroId === hero.id)?.hp ?? currentHp(done, hero, loop.endsAt));
    expect(done.heroes.map((hero) => currentHp(done, hero, loop.endsAt))).toEqual(expected);
  });

  it('an ambush with nobody aboard is lost: the cargo is gone and the cart returns empty after the configured minutes', () => {
    jest.replaceProperty(supplyRules.danger, 'ambushChance', [1, 1, 1, 1]);
    const empty = setCrew(readySave(), null, [], now);
    const started = startCart(empty, now);
    const loop = started.supply.cart.loop!;
    const ambush = loop.events.find((event) => event.kind === 'ambush')!;
    expect(ambush.kind === 'ambush' && ambush.won).toBeNull();
    expect(loop.endsAt).toBe(ambush.at + supplyRules.cart.lostReturnMinutes * MINUTE);
    const done = settleCart(started, loop.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === 1)!;
    expect(line.delivered).toEqual({});
    expect(line.ambush!.won).toBeNull();
    expect(done.supply.cart.cargo).toEqual({});
  });
});

describe('crew and parking', () => {
  it('a hurt crew parks the cart with waitingForCrew, and startCart starts it again', () => {
    const started = startCart(setRoute(setCrew(baseSave(), 'bram', ['lyra'], now), [{ building: 'b1' }], null, now), now);
    const exhausted = {
      ...started,
      heroes: started.heroes.map((hero) => (hero.id === 'bram' ? { ...hero, exhaustedUntil: now + 48 * HOUR } : hero)),
    };
    const done = settleCart(exhausted, started.supply.cart.loop!.endsAt);
    expect(done.supply.cart.loop).toBeNull();
    expect(done.supply.cart.waitingForCrew).toBe(true);
    expect(cartProblem(done, now + 2 * HOUR)).toBe('crewHurt');
    const healed = { ...done, heroes: done.heroes.map((hero) => (hero.id === 'bram' ? { ...hero, exhaustedUntil: 0 } : hero)) };
    const restarted = startCart(healed, now + 2 * HOUR);
    expect(restarted.supply.cart.loop).not.toBeNull();
    expect(restarted.supply.cart.waitingForCrew).toBe(false);
  });

  it('a Teamster driver raises speed and capacity by level, and gains the loop’s hours as trade hours', () => {
    const base = baseSave();
    const plain = setCrew(base, 'bram', [], now);
    const teamster = setCrew(base, 'mira', [], now);
    const noDriver = setCrew(base, null, [], now);
    const level = 0; // fresh trade: level 1, first bonus entry
    expect(cartSpeedMps(teamster)).toBeCloseTo((supplyRules.cart.speedKmh * (1 + supplyRules.cart.teamster.speed[level]) * 1000) / 3600);
    expect(cartSpeedMps(plain)).toBeCloseTo((supplyRules.cart.speedKmh * 1000) / 3600);
    expect(cartSpeedMps(noDriver)).toBeCloseTo((supplyRules.cart.speedKmh * supplyRules.cart.noDriverSpeed * 1000) / 3600);
    expect(cartCapacity(teamster)).toBeCloseTo(supplyRules.cart.capacity * (1 + supplyRules.cart.teamster.capacity[level]));
    const started = startCart(setRoute(teamster, [{ building: 'b1' }], null, now), now);
    const loop = started.supply.cart.loop!;
    const done = settleCart(started, loop.endsAt);
    const hours = done.heroes.find((hero) => hero.id === 'mira')!.trade.hours;
    expect(hours).toBeCloseTo((loop.endsAt - loop.startedAt) / HOUR);
  });

  it('crew heroes are away only while a loop runs, and the crew cannot change while running', () => {
    const parked = readySave();
    expect(isAway(parked, 'bram')).toBe(false);
    const started = startCart(parked, now);
    expect(isAway(started, 'bram')).toBe(true);
    expect(isAway(started, 'lyra')).toBe(true);
    expect(isAway(started, 'mira')).toBe(false);
    expect(crewProblem(started, 'mira', [], now)).toBe('running');
    expect(() => setCrew(started, 'mira', [], now)).toThrow(/running/);
    const stopped = stopCart(started, now);
    expect(stopped.supply.cart.nextRoute).toEqual([]);
    const home = settleCart(stopped, started.supply.cart.loop!.endsAt);
    expect(home.supply.cart.loop).toBeNull();
    expect(isAway(home, 'bram')).toBe(false);
  });
});

describe('routePreview', () => {
  it('matches 1 − Π(1 − p) over the crossed cells, each at its real danger level', () => {
    jest.restoreAllMocks();
    const save = baseSave();
    const waypoint = cellNear(900, 200);
    const route = [{ building: 'b1' }, { via: tileCenter(waypoint) }] as ({ building: string } | { via: LatLng })[];
    const preview = routePreview(save, route, now);
    const crossed = routeCells(preview.points);
    expect(crossed).toContain(waypoint);
    let none = 1;
    for (const cell of crossed) {
      const entry = preview.cells.find((c) => c.cell === cell)!;
      const level = entry.level as 0 | 1 | 2 | 3;
      none *= 1 - supplyRules.danger.ambushChance[level];
    }
    expect(preview.ambushChance).toBeCloseTo(1 - none);
  });
});

describe('place stops', () => {
  const order: Order = {
    placeId: 't1',
    kind: 'tavern',
    wants: { grain: 10 },
    total: 10,
    delivered: {},
    goldFraction: 0,
    goldPaid: 0,
    steps: [],
    headline: emptyLoot(),
    expiresAt: now + 6 * 24 * HOUR,
  };
  const placePosition = offsetPosition(origin, 400, 45);
  const placeSave = (): SaveData => {
    const save = baseSave();
    return { ...save, supply: { ...save.supply, orders: { t1: order } } };
  };
  const placeRoute = [{ building: 'b1' }, { place: 't1', position: placePosition }] as ({ building: string } | { place: string; position: LatLng })[];

  it('unloads what the order wants at the place, paid like a delivery in person, and logs it', () => {
    const started = startCart(setRoute(setCrew(placeSave(), 'bram', ['lyra'], now), placeRoute, null, now), now);
    const loop = started.supply.cart.loop!;
    expect(loop.events.some((event) => event.kind === 'place' && event.placeId === 't1')).toBe(true);
    const done = settleCart(started, loop.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === 1)!;
    const gold = Math.floor(8 * supplyRules.orders.goldPerUnitShare * materialPrices.grain);
    expect(line.places).toEqual([{ placeId: 't1', goods: { grain: 8 }, gold }]);
    expect(line.delivered).toEqual({});
    expect(done.gold).toBe(started.gold + gold);
    expect(done.supply.orders.t1.delivered.grain).toBe(8);
    expect(done.supply.orders.t1.goldPaid).toBe(gold);
  });

  it('skips a place whose order has expired, and brings the cargo home', () => {
    const expired = { ...placeSave(), supply: { ...placeSave().supply, orders: { t1: { ...order, expiresAt: now + 1 } } } };
    const started = startCart(setRoute(setCrew(expired, 'bram', ['lyra'], now), placeRoute, null, now), now);
    const done = settleCart(started, started.supply.cart.loop!.endsAt);
    const line = done.supply.cart.log.find((entry) => entry.n === 1)!;
    expect(line.places).toEqual([]);
    expect(line.delivered.grain).toBeGreaterThanOrEqual(8);
  });

  it('keeps looping while the route holds a live order place, and parks when it expires', () => {
    const onlyPlace = [{ place: 't1', position: placePosition }] as { place: string; position: LatLng }[];
    const started = startCart(setRoute(setCrew(placeSave(), 'bram', [], now), onlyPlace, null, now), now);
    const once = settleCart(started, started.supply.cart.loop!.endsAt);
    expect(once.supply.cart.loop).not.toBeNull();
    const expired = { ...once, supply: { ...once.supply, orders: { t1: { ...order, expiresAt: now } } } };
    const parked = settleCart(expired, expired.supply.cart.loop!.endsAt);
    expect(parked.supply.cart.loop).toBeNull();
  });
});

describe('routeProblem', () => {
  it('rejects a route with no building or place, and one beyond the tier\'s building reach', () => {
    const save = baseSave();
    expect(routeProblem(save, [{ via: origin }])).toBe('noStop');
    const far = buildingAt(offsetPosition(origin, supplyRules.buildings.limits[1].meters + 500, 0), 'b3', {});
    const beyond = { ...save, supply: { ...save.supply, buildings: [...save.supply.buildings, far] } };
    expect(routeProblem(beyond, [{ building: 'b3' }])).toBe('tooFar');
    expect(routeProblem(save, [{ building: 'b1' }])).toBeNull();
    expect(routeProblem(save, [{ place: 't1', position: offsetPosition(origin, 400, 0) }])).toBeNull();
    expect(routeProblem({ ...save, supply: { ...save.supply, hall: null } }, [{ building: 'b1' }])).toBe('noHall');
  });
});

describe('upcomingUnload', () => {
  const order: Order = {
    placeId: 't1',
    kind: 'tavern',
    wants: { grain: 10 },
    total: 10,
    delivered: {},
    goldFraction: 0,
    goldPaid: 0,
    steps: [],
    headline: emptyLoot(),
    expiresAt: now + 6 * 24 * HOUR,
  };
  const placePosition = offsetPosition(origin, 400, 45);
  const route = [{ building: 'b1' }, { place: 't1', position: placePosition }] as ({ building: string } | { place: string; position: LatLng })[];

  it('plays the loop from the current cargo: the building loads, the place takes what it still wants', () => {
    const save = { ...baseSave(), supply: { ...baseSave().supply, orders: { t1: order } } };
    const started = startCart(setRoute(setCrew(save, 'bram', ['lyra'], now), route, null, now), now);
    expect(upcomingUnload(started, 't1', now)).toEqual({ grain: 8 });
  });

  it('is null when the cart is parked, when the place is not on the route, and once the call has passed', () => {
    const save = { ...baseSave(), supply: { ...baseSave().supply, orders: { t1: order } } };
    expect(upcomingUnload(setRoute(setCrew(save, 'bram', [], now), route, null, now), 't1', now)).toBeNull();
    const started = startCart(setRoute(setCrew(save, 'bram', ['lyra'], now), route, null, now), now);
    expect(upcomingUnload(started, 'other', now)).toBeNull();
    const loop = started.supply.cart.loop!;
    const atPlace = loop.events.find((event) => event.kind === 'place')!.at;
    const settled = settleCart(started, atPlace + 1);
    expect(upcomingUnload(settled, 't1', atPlace + 1)).toBeNull();
  });
});

describe('loopPreview', () => {
  it('shows each stop\'s loads and unloads, what comes home, and the stops leaving before the next loop ends', () => {
    const order: Order = {
      placeId: 't1',
      kind: 'tavern',
      wants: { grain: 10 },
      total: 10,
      delivered: {},
      goldFraction: 0,
      goldPaid: 0,
      steps: [],
      headline: emptyLoot(),
      expiresAt: now + 6 * 24 * HOUR,
    };
    const leaving = buildingAt(offsetPosition(origin, 300, 0), 'b1', { grain: 8 });
    leaving.expiresAt = now + 10 * MINUTE;
    const save: SaveData = {
      ...baseSave(),
      supply: { ...baseSave().supply, buildings: [leaving, buildingAt(offsetPosition(origin, 600, 90), 'b2', { stone: 6 })], orders: { t1: order } },
    };
    const route = [{ building: 'b1' }, { place: 't1', position: offsetPosition(origin, 400, 45) }] as ({ building: string } | { place: string; position: LatLng })[];
    const preview = loopPreview(save, route, null, now);
    expect(preview.stops[0].loads.grain).toBe(8);
    expect(preview.stops[1].unloads.grain).toBe(8);
    expect(preview.home).toEqual({});
    expect(preview.meters).toBeGreaterThan(0);
    expect(preview.minutes).toBeGreaterThan(0);
    expect(preview.straightLegs).toEqual([0, 1, 2]);
    expect(preview.leaving).toEqual(['b1']);
  });
});

describe('position and tick', () => {
  it('cartPositionAt walks the polyline and cartNextEventAt gives the next event or the end', () => {
    const started = startCart(readySave(), now);
    const loop = started.supply.cart.loop!;
    const at = cartPositionAt(loop, loop.startedAt + 1000);
    expect(at).not.toBeNull();
    expect(cartPositionAt(loop, loop.endsAt)).toBeNull();
    expect(cartPositionAt(loop, loop.startedAt - 3000)).toEqual(loop.points[0]);
    expect(cartNextEventAt(started.supply.cart)).toBe(loop.events[0].at);
    const settled = settleCart(started, loop.events[0].at);
    expect(cartNextEventAt(settled.supply.cart)).toBe(loop.events[1].at);
  });
});

describe('performance', () => {
  it('replays eight hours with two buildings in under 500 ms', () => {
    const started = startCart(readySave(), now);
    const began = Date.now();
    settleCart(started, now + 8 * HOUR);
    expect(Date.now() - began).toBeLessThan(500);
  });
});
