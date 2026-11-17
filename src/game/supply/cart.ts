import type { PatrolDifficulty } from '@/content/patrols';
import { placeRules } from '@/content/places';
import { supplyRules } from '@/content/supplyLines';

import { cellAt, cellsAlong } from '../discovery/cells';
import { highestUnlockedTier } from '../expeditions/expeditions';
import { localDayIndex, localDayStart } from '../generation/localDays';
import { distanceMeters, interpolate } from '../generation/geo';
import { createRng } from '../generation/rng';
import { tileCenter } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import { addMaterials } from '../inventory';
import { grantLoot } from '../loot/grant';
import { emptyLoot } from '../loot/types';
import { settleConsumables } from '../patrols/fight';
import type { PatrolKind, PatrolSpawn } from '../patrols/generate';
import { applyRunHp, currentHp, isExhausted, maxHp } from '../team/health';
import { isBusy } from '../team/team';
import type { SaveData } from '../save';
import { buildingReach } from './buildings';
import { ambushChance, cellAmbusher, dangerContextOf, dayDangers } from './danger';
import { playPatrolFight, syntheticPatrol } from './fights';
import { deliverGoods, orderProgress } from './orders';
import { settleBuilding } from './production';
import { straightStreetPath } from './streets';
import { tradeLevel } from './trades';
import type { Cart, CartEvent, RoutePoint, StreetPath } from './types';

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** A stop on the route: a building's position, a discovered place's, or a street point forced between them. */
/** A route point as a stop; a building gone since the route was set keeps its slot with no position. */
type Stop = { at: LatLng | null; buildingId: string | null; placeId: string | null };

/** The route's stops, one per route point, in order. */
export function routeStops(save: SaveData, route: RoutePoint[]): Stop[] {
  const stops: Stop[] = [];
  for (const point of route) {
    if ('building' in point) {
      const building = save.supply.buildings.find((b) => b.id === point.building);
      stops.push({ at: building?.position ?? null, buildingId: point.building, placeId: null });
    } else if ('place' in point) {
      stops.push({ at: point.position, buildingId: null, placeId: point.place });
    } else {
      stops.push({ at: point.via, buildingId: null, placeId: null });
    }
  }
  return stops;
}

/** The loop's straight-line path: the hall's centre, each stop, back to the hall. */
export function routePoints(save: SaveData, route: RoutePoint[]): LatLng[] {
  const hall = save.supply.hall;
  if (!hall) return [];
  const centre = tileCenter(hall.cell);
  return [centre, ...liveStopPositions(routeStops(save, route)), centre];
}

const liveStopPositions = (stops: Stop[]): LatLng[] => stops.flatMap((stop) => (stop.at ? [stop.at] : []));

/**
 * The path the loop drives and its stops, paired index for index: the stored
 * street path holds one stop per route point, so a building gone since keeps
 * its slot and the cart simply drives past; without a matching stored path,
 * the straight path through the stops still there.
 */
function loopPlan(save: SaveData, route: RoutePoint[], path: StreetPath | null, hall: LatLng): { path: StreetPath; stops: Stop[] } {
  const stops = routeStops(save, route);
  if (path && path.stopAt.length === stops.length) return { path, stops };
  const live = stops.filter((stop) => stop.at !== null);
  return { path: straightStreetPath(hall, liveStopPositions(live)), stops: live };
}

/** The distance travelled along the path up to each of its points. */
function travelledMeters(points: LatLng[]): number[] {
  const travelled = [0];
  for (let i = 1; i < points.length; i++) travelled.push(travelled[i - 1] + distanceMeters(points[i - 1], points[i]));
  return travelled;
}

/** The cargo minus what was handed over. */
function cargoLeft(cargo: Record<string, number>, taken: Record<string, number>): Record<string, number> {
  const left: Record<string, number> = {};
  for (const [good, amount] of Object.entries(cargo)) {
    const rest = amount - (taken[good] ?? 0);
    if (rest > 0) left[good] = rest;
  }
  return left;
}

/** The distinct cells the path crosses, in first-crossing order. */
export function routeCells(points: LatLng[]): string[] {
  const cells: string[] = [];
  for (let i = 1; i < points.length; i++) {
    for (const cell of cellsAlong(points[i - 1], points[i])) {
      if (!cells.includes(cell)) cells.push(cell);
    }
  }
  return cells;
}

/** The path's length in metres. */
export function routeLength(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

/** Each distinct cell the path crosses, with the time of its first crossing. */
function crossings(points: LatLng[], startedAt: number, speedMps: number): { cell: string; at: number }[] {
  const crossed: { cell: string; at: number }[] = [];
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const leg = distanceMeters(from, to);
    const steps = Math.ceil(leg / supplyRules.cellStepMeters);
    for (let s = 0; s <= steps; s++) {
      const cell = cellAt(interpolate(from, to, steps === 0 ? 0 : s / steps));
      if (!crossed.some((c) => c.cell === cell)) {
        crossed.push({ cell, at: startedAt + ((travelled + (leg * s) / (steps || 1)) / speedMps) * 1000 });
      }
    }
    travelled += leg;
  }
  return crossed;
}

/** The crew's hero ids, driver first. */
const crewIds = (cart: Cart): string[] => (cart.crew.driver ? [cart.crew.driver, ...cart.crew.escorts] : cart.crew.escorts);

/** The driver, if there is one. */
const driverOf = (save: SaveData) => {
  const driver = save.supply.cart.crew.driver;
  return driver ? save.heroes.find((h) => h.id === driver) : undefined;
};

/** The cart's speed in m/s: slower with no driver, faster with a Teamster driving. */
export function cartSpeedMps(save: SaveData): number {
  let kmh = supplyRules.cart.speedKmh;
  const driver = driverOf(save);
  if (!driver) kmh *= supplyRules.cart.noDriverSpeed;
  else if (driver.trade.id === 'teamster') kmh *= 1 + supplyRules.cart.teamster.speed[tradeLevel(driver.trade.hours) - 1];
  return (kmh * 1000) / 3600;
}

/** The cart's capacity in units, raised by a Teamster driving. */
export function cartCapacity(save: SaveData): number {
  const driver = driverOf(save);
  const bonus = driver?.trade.id === 'teamster' ? supplyRules.cart.teamster.capacity[tradeLevel(driver.trade.hours) - 1] : 0;
  return supplyRules.cart.capacity * (1 + bonus);
}

/** Each crossed cell's danger level, by the day average of the day it is crossed on. */
function levelsOf(save: SaveData, crossed: { cell: string; at: number }[]): Map<string, 0 | 1 | 2 | 3> {
  const ctx = dangerContextOf(save);
  const byDay = new Map<number, string[]>();
  for (const { cell, at } of crossed) {
    const day = localDayIndex(at, placeRules.changeHourLocal);
    byDay.set(day, [...(byDay.get(day) ?? []), cell]);
  }
  const levels = new Map<string, 0 | 1 | 2 | 3>();
  for (const [day, cells] of byDay) {
    const dangers = dayDangers(cells, localDayStart(day, placeRules.changeHourLocal), ctx);
    for (const cell of cells) levels.set(cell, dangers[cell].level);
  }
  return levels;
}

/** One ambush fight, played out at departure: the event to store, and the save with the fight's HP for the next one. */
function fightEvent(
  working: SaveData,
  crew: string[],
  spawn: PatrolSpawn,
  cell: string,
  at: number,
  n: number,
): { save: SaveData; event: Extract<CartEvent, { kind: 'ambush' }> } {
  const fought = playPatrolFight(working, crew, spawn, `cart|${n}|${cell}`, at);
  return {
    save: fought.save,
    event: { at, kind: 'ambush', cell, patrolKind: spawn.kind as PatrolKind, difficulty: spawn.difficulty!, ...fought.result },
  };
}

/** Everything about a loop, fixed when it starts: its path, speed, and the events with their fights played out. */
function planLoop(save: SaveData, at: number, n: number): Cart['loop'] {
  const cart = save.supply.cart;
  const hall = save.supply.hall;
  if (!hall) return { n, startedAt: at, endsAt: at, points: [], speedMps: cartSpeedMps(save), capacity: cartCapacity(save), events: [], unloaded: [] };
  const centre = tileCenter(hall.cell);
  const { path, stops } = loopPlan(save, cart.route, cart.path, centre);
  const points = path.points;
  const travelled = travelledMeters(points);
  const speedMps = cartSpeedMps(save);
  const capacity = cartCapacity(save);
  const crew = crewIds(cart);

  const events: CartEvent[] = [];
  stops.forEach((stop, i) => {
    const atStop = at + (travelled[path.stopAt[i]] / speedMps) * 1000;
    if (stop.buildingId && stop.at) events.push({ at: atStop, kind: 'building', buildingId: stop.buildingId });
    else if (stop.placeId) events.push({ at: atStop, kind: 'place', placeId: stop.placeId });
  });

  const crossed = crossings(points, at, speedMps);
  const levels = levelsOf(save, crossed);
  const ctx = dangerContextOf(save);
  const tier = highestUnlockedTier(save);
  let working = save;
  let lostAt: number | null = null;
  for (const { cell, at: crossingAt } of crossed) {
    const level = (levels.get(cell) ?? 0) as 0 | 1 | 2 | 3;
    if (!createRng(`cart|${n}|${cell}`).chance(ambushChance(level))) continue;
    const difficulty: PatrolDifficulty = level === 1 ? 'easy' : level === 2 ? 'medium' : 'hard';
    const spawn = cellAmbusher(cell, crossingAt, ctx) ?? syntheticPatrol(tier, difficulty, `cart-kind|${n}|${cell}`, cell, crossingAt);
    if (crew.length === 0) {
      events.push({ at: crossingAt, kind: 'ambush', cell, patrolKind: spawn.kind as PatrolKind, difficulty: spawn.difficulty!, won: null, hp: [], salvaged: [], rewards: emptyLoot() });
      lostAt = crossingAt;
      break;
    }
    const fought = fightEvent(working, crew, spawn, cell, crossingAt, n);
    working = fought.save;
    events.push(fought.event);
    if (!fought.event.won) {
      lostAt = crossingAt;
      break;
    }
  }

  events.sort((a, b) => a.at - b.at);
  // A lost ambush ends the loop: no later events, and the cart comes home empty.
  const kept = lostAt === null ? events : events.filter((event) => event.at <= lostAt!);
  const endsAt = lostAt === null ? at + (travelled[travelled.length - 1] / speedMps) * 1000 : lostAt + supplyRules.cart.lostReturnMinutes * MINUTE;
  return { n, startedAt: at, endsAt, points, speedMps, capacity, events: kept, unloaded: [] };
}

/** Starts a loop at `at`: the plan is fixed, and the cargo starts empty. */
export function startLoop(save: SaveData, at: number, n = 1): SaveData {
  const cart = save.supply.cart;
  return {
    ...save,
    supply: { ...save.supply, cart: { ...cart, loop: planLoop(save, at, n), cargo: {}, settledAt: at } },
  };
}

const stockTotal = (stock: Record<string, number>): number => Object.values(stock).reduce((sum, amount) => sum + amount, 0);

/** Loads the building's stock up to the cart's free capacity, largest material first, ties by material id. */
function loadStock(cargo: Record<string, number>, stock: Record<string, number>, capacity: number): { cargo: Record<string, number>; stock: Record<string, number> } {
  let free = capacity - stockTotal(cargo);
  const taken = Object.entries(stock)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const nextStock = { ...stock };
  const nextCargo = { ...cargo };
  for (const [material, amount] of taken) {
    if (free <= 0) break;
    const load = Math.min(amount, free);
    nextCargo[material] = (nextCargo[material] ?? 0) + load;
    nextStock[material] = amount - load;
    free -= load;
  }
  return { cargo: nextCargo, stock: nextStock };
}

/** Whether a crew member came home too hurt to set out again. */
function crewHurt(save: SaveData, crew: string[], at: number): boolean {
  return crew.some((heroId) => {
    const hero = save.heroes.find((h) => h.id === heroId);
    if (!hero) return false;
    return isExhausted(hero, at) || currentHp(save, hero, at) < supplyRules.cart.minCrewHpShare * maxHp(save, hero);
  });
}

/** Whether the route still holds a stop worth a loop: a live building, or a place whose order is alive. */
function hasLiveStop(save: SaveData, route: RoutePoint[], at: number): boolean {
  return route.some((point) => {
    if ('building' in point) return save.supply.buildings.some((building) => building.id === point.building);
    if ('place' in point) return (save.supply.orders[point.place]?.expiresAt ?? 0) > at;
    return false;
  });
}

/** Closes a finished loop at its end: delivers, pays the fights, logs it, and either parks or starts the next one. */
function finishLoop(save: SaveData): SaveData {
  const cart = save.supply.cart;
  const loop = cart.loop!;
  const crew = crewIds(cart);
  const ambushes = loop.events.filter((event): event is Extract<CartEvent, { kind: 'ambush' }> => event.kind === 'ambush');

  const delivered = Object.entries(cart.cargo).filter(([, amount]) => amount > 0);
  let next: SaveData = {
    ...save,
    materials: addMaterials(save.materials, delivered.map(([materialId, amount]) => ({ materialId, amount }))),
  };
  for (const event of ambushes) next = settleConsumables(next, crew, event.salvaged);
  for (const event of ambushes) if (event.won) next = grantLoot(next, crew, event.rewards, loop.endsAt, 'patrol');
  for (const event of ambushes) next = applyRunHp(next, event.hp, loop.endsAt);
  const driver = cart.crew.driver;
  if (driver) {
    const hours = (loop.endsAt - loop.startedAt) / HOUR;
    next = {
      ...next,
      heroes: next.heroes.map((hero) => (hero.id === driver && hero.trade.id === 'teamster' ? { ...hero, trade: { ...hero.trade, hours: hero.trade.hours + hours } } : hero)),
    };
  }

  const first = ambushes[0];
  const line = {
    n: loop.n,
    endedAt: loop.endsAt,
    delivered: Object.fromEntries(delivered),
    places: loop.unloaded,
    ambush: first ? { cell: first.cell, kind: first.patrolKind, won: first.won } : null,
  };
  let route = cart.route;
  let nextRoute = cart.nextRoute;
  let path = cart.path;
  let nextPath = cart.nextPath;
  if (nextRoute !== null) {
    route = nextRoute;
    nextRoute = null;
    path = nextPath;
    nextPath = null;
  }
  const parked: Cart = {
    ...cart,
    route,
    nextRoute,
    path,
    nextPath,
    cargo: {},
    log: [...cart.log, line].slice(-supplyRules.cart.logSize),
    settledAt: loop.endsAt,
  };
  next = { ...next, supply: { ...next.supply, cart: parked } };
  if (crewHurt(next, crew, loop.endsAt)) return { ...next, supply: { ...next.supply, cart: { ...parked, loop: null, waitingForCrew: true } } };
  if (!next.supply.hall || !hasLiveStop(next, route, loop.endsAt)) return { ...next, supply: { ...next.supply, cart: { ...parked, loop: null } } };
  return startLoop(next, loop.endsAt, loop.n + 1);
}

/**
 * Settles the cart to `now`: the current loop's events play out in order, and
 * each finished loop delivers, pays its fights and starts the next one, so
 * one call replays every loop since the last settlement.
 */
export function settleCart(save: SaveData, now: number): SaveData {
  let next = save;
  for (;;) {
    const cart = next.supply.cart;
    const loop = cart.loop;
    if (!loop) return next;

    const upto = Math.min(now, loop.endsAt);
    let cargo = cart.cargo;
    let buildings = next.supply.buildings;
    let unloaded = loop.unloaded;
    let changed = false;
    for (const event of loop.events) {
      if (event.at <= cart.settledAt || event.at > upto) continue;
      changed = true;
      if (event.kind === 'building') {
        // A building that expired mid-loop is simply skipped: its stock went with it.
        const index = buildings.findIndex((building) => building.id === event.buildingId);
        if (index === -1) continue;
        const settled = settleBuilding(next, buildings[index], event.at);
        const loaded = loadStock(cargo, settled.stock, loop.capacity);
        cargo = loaded.cargo;
        buildings = buildings.map((building, i) => (i === index ? { ...settled, stock: loaded.stock } : building));
      } else if (event.kind === 'place') {
        // A place whose order is gone, expired or filled is simply skipped.
        const order = next.supply.orders[event.placeId];
        if (!order || order.expiresAt <= event.at || orderProgress(order) >= 1) continue;
        const given = deliverGoods(next, event.placeId, cargo, event.at);
        next = given.save;
        cargo = cargoLeft(cargo, given.taken);
        unloaded = [...unloaded, { placeId: event.placeId, goods: given.taken, gold: given.gold }];
      } else if (event.won !== true) {
        cargo = {};
      }
    }
    if (changed) {
      next = { ...next, supply: { ...next.supply, buildings, cart: { ...next.supply.cart, cargo, loop: { ...loop, unloaded } } } };
    }
    if (loop.endsAt > now) return { ...next, supply: { ...next.supply, cart: { ...next.supply.cart, settledAt: now } } };
    next = finishLoop(next);
  }
}

/** What a route would mean: its path, length, loop time, each crossed cell's level now, and the chance of at least one ambush. */
export function routePreview(save: SaveData, route: RoutePoint[], now: number) {
  const points = routePoints(save, route);
  const meters = routeLength(points);
  const speedMps = cartSpeedMps(save);
  const crossed = routeCells(points);
  const dangers = crossed.length > 0 ? dayDangers(crossed, now, dangerContextOf(save)) : {};
  const cells = crossed.map((cell) => ({
    cell,
    level: (dangers[cell]?.level ?? 0) as 0 | 1 | 2 | 3,
  }));
  const ambushChanceTotal = 1 - cells.reduce((none, { level }) => none * (1 - ambushChance(level)), 1);
  return { points, meters, loopMinutes: meters / speedMps / 60, cells, ambushChance: ambushChanceTotal };
}

/**
 * What one loop from now would do, with today's stock and orders: each stop's
 * loads and unloads, what comes home, the loop's length and time, its chance
 * of at least one ambush, its straight legs, and the stops that leave before
 * the end of the loop after it.
 */
export function loopPreview(save: SaveData, route: RoutePoint[], path: StreetPath | null, now: number) {
  const hall = save.supply.hall;
  const centre = hall ? tileCenter(hall.cell) : { latitude: 0, longitude: 0 };
  const { path: used, stops: planned } = loopPlan(save, route, path, centre);
  const travelled = travelledMeters(used.points);
  const speedMps = cartSpeedMps(save);
  const capacity = cartCapacity(save);
  const meters = travelled[travelled.length - 1] ?? 0;
  const minutes = meters / speedMps / 60;

  let cargo: Record<string, number> = {};
  const stops = planned.map((stop): { point: Stop; loads: Record<string, number>; unloads: Record<string, number> } => {
    if (stop.buildingId) {
      const building = save.supply.buildings.find((b) => b.id === stop.buildingId);
      if (!building) return { point: stop, loads: {}, unloads: {} };
      const before = cargo;
      cargo = loadStock(cargo, building.stock, capacity).cargo;
      const loads = Object.fromEntries(
        Object.keys(cargo)
          .map((good) => [good, cargo[good] - (before[good] ?? 0)] as const)
          .filter(([, amount]) => amount > 0),
      );
      return { point: stop, loads, unloads: {} };
    }
    if (stop.placeId) {
      const order = save.supply.orders[stop.placeId];
      if (order && order.expiresAt > now && orderProgress(order) < 1) {
        const unloads = deliverGoods(save, stop.placeId, cargo, now).taken;
        cargo = cargoLeft(cargo, unloads);
        return { point: stop, loads: {}, unloads };
      }
    }
    return { point: stop, loads: {}, unloads: {} };
  });

  const crossed = routeCells(used.points);
  const dangers = crossed.length > 0 ? dayDangers(crossed, now, dangerContextOf(save)) : {};
  const ambushChanceTotal = 1 - crossed.reduce((none, cell) => none * (1 - ambushChance(dangers[cell]?.level ?? 0)), 1);
  const nextLoopEnd = now + 2 * minutes * MINUTE;
  const leaving = route.flatMap((point) => {
    if ('building' in point) {
      return save.supply.buildings.some((b) => b.id === point.building && b.expiresAt < nextLoopEnd) ? [point.building] : [];
    }
    if ('place' in point) {
      return (save.supply.orders[point.place]?.expiresAt ?? Infinity) < nextLoopEnd ? [point.place] : [];
    }
    return [];
  });
  return { stops, home: cargo, meters, minutes, ambushChance: ambushChanceTotal, straightLegs: used.straightLegs, leaving };
}

/**
 * What the running loop will still unload at the place, played out from the
 * cart's current cargo: the remaining building loads and place unloads, in
 * order. Null when the loop will not call there again.
 */
export function upcomingUnload(save: SaveData, placeId: string, _now: number): Record<string, number> | null {
  const cart = save.supply.cart;
  const loop = cart.loop;
  if (!loop) return null;
  if (!loop.events.some((event) => event.kind === 'place' && event.placeId === placeId && event.at > cart.settledAt)) return null;
  let cargo = cart.cargo;
  let unload: Record<string, number> | null = null;
  for (const event of loop.events) {
    if (event.at <= cart.settledAt) continue;
    if (event.kind === 'building') {
      const building = save.supply.buildings.find((b) => b.id === event.buildingId);
      if (building) cargo = loadStock(cargo, building.stock, loop.capacity).cargo;
    } else if (event.kind === 'place') {
      const order = save.supply.orders[event.placeId];
      if (order && order.expiresAt > event.at && orderProgress(order) < 1) {
        const given = deliverGoods(save, event.placeId, cargo, event.at);
        cargo = cargoLeft(cargo, given.taken);
        if (event.placeId === placeId) unload = given.taken;
      }
    } else if (event.won !== true) {
      cargo = {};
    }
  }
  return unload;
}

export type CartProblem = 'noHall' | 'noRoute' | 'running' | 'crewBusy' | 'crewHurt' | null;

/** Why the cart cannot set out now, or null. */
export function cartProblem(save: SaveData, now: number): CartProblem {
  const cart = save.supply.cart;
  if (!save.supply.hall) return 'noHall';
  if (cart.loop) return 'running';
  if (cart.route.length === 0) return 'noRoute';
  const crew = crewIds(cart);
  if (crew.some((heroId) => isBusy(save, heroId))) return 'crewBusy';
  if (crewHurt(save, crew, now)) return 'crewHurt';
  return null;
}

/** Starts the cart from a parked standstill, at the log's next loop number. */
export function startCart(save: SaveData, now: number): SaveData {
  const problem = cartProblem(save, now);
  if (problem) throw new Error(`Cannot start the cart: ${problem}`);
  const cart = save.supply.cart;
  const n = (cart.log.length > 0 ? cart.log[cart.log.length - 1].n : 0) + 1;
  return startLoop({ ...save, supply: { ...save.supply, cart: { ...cart, waitingForCrew: false } } }, now, n);
}

export type RouteProblem = 'noHall' | 'noStop' | 'tooFar' | null;

/** Why a route cannot be set, or null: it needs a hall and a live stop within the tier's building reach of it. */
export function routeProblem(save: SaveData, route: RoutePoint[]): RouteProblem {
  if (!save.supply.hall) return 'noHall';
  if (!route.some((point) => 'building' in point || 'place' in point)) return 'noStop';
  const hall = save.supply.hall;
  const centre = tileCenter(hall.cell);
  const reach = buildingReach(save).meters;
  for (const point of route) {
    const at = 'building' in point
      ? save.supply.buildings.find((building) => building.id === point.building)?.position
      : 'place' in point
        ? point.position
        : null;
    if (at && distanceMeters(centre, at) > reach) return 'tooFar';
  }
  return null;
}

/** Sets the route and its path: while a loop runs both apply at the next departure. */
export function setRoute(save: SaveData, route: RoutePoint[], path: StreetPath | null, _now: number): SaveData {
  const problem = routeProblem(save, route);
  if (problem) throw new Error(`Cannot set the route: ${problem}`);
  const cart = save.supply.cart;
  const hall = save.supply.hall;
  const stored =
    path ??
    (hall ? straightStreetPath(tileCenter(hall.cell), liveStopPositions(routeStops(save, route))) : null);
  if (cart.loop) return { ...save, supply: { ...save.supply, cart: { ...cart, nextRoute: route, nextPath: stored } } };
  return { ...save, supply: { ...save.supply, cart: { ...cart, route, path: stored } } };
}

/** Parks the cart: after the current loop, or at once when parked. */
export function stopCart(save: SaveData, _now: number): SaveData {
  const cart = save.supply.cart;
  if (cart.loop) return { ...save, supply: { ...save.supply, cart: { ...cart, nextRoute: [], nextPath: null } } };
  return { ...save, supply: { ...save.supply, cart: { ...cart, route: [], path: null } } };
}

export type CrewProblem = 'running' | 'tooMany' | 'busy' | 'duplicate' | null;

/** Why the crew cannot be changed to this now, or null. */
export function crewProblem(save: SaveData, driver: string | null, escorts: string[], _now: number): CrewProblem {
  if (save.supply.cart.loop) return 'running';
  if (escorts.length > supplyRules.cart.maxEscorts) return 'tooMany';
  const ids = driver ? [driver, ...escorts] : escorts;
  if (new Set(ids).size !== ids.length) return 'duplicate';
  if (ids.some((heroId) => isBusy(save, heroId))) return 'busy';
  return null;
}

/** Sets the crew, which can only change while the cart is parked. */
export function setCrew(save: SaveData, driver: string | null, escorts: string[], now: number): SaveData {
  const problem = crewProblem(save, driver, escorts, now);
  if (problem) throw new Error(`Cannot set the crew: ${problem}`);
  return { ...save, supply: { ...save.supply, cart: { ...save.supply.cart, crew: { driver, escorts } } } };
}

/**
 * Where the cart is at `t`: along its path, at the hall before it sets out
 * (a map clock a few seconds behind the start) or after a lost ambush, null
 * once the loop is over.
 */
export function cartPositionAt(loop: Cart['loop'], t: number): LatLng | null {
  if (!loop || t >= loop.endsAt) return null;
  if (t < loop.startedAt) return loop.points[0];
  const lost = loop.events.find((event): event is Extract<CartEvent, { kind: 'ambush' }> => event.kind === 'ambush' && event.won !== true);
  if (lost && t >= lost.at) return loop.points[0];
  let remaining = ((t - loop.startedAt) / 1000) * loop.speedMps;
  for (let i = 1; i < loop.points.length; i++) {
    const leg = distanceMeters(loop.points[i - 1], loop.points[i]);
    if (remaining <= leg) return interpolate(loop.points[i - 1], loop.points[i], leg === 0 ? 0 : remaining / leg);
    remaining -= leg;
  }
  return loop.points[loop.points.length - 1];
}

/** When the cart's next event is due, or the loop's end: what the app's tick waits for. */
export function cartNextEventAt(cart: Cart): number | null {
  if (!cart.loop) return null;
  const next = cart.loop.events.find((event) => event.at > cart.settledAt);
  return next ? next.at : cart.loop.endsAt;
}
