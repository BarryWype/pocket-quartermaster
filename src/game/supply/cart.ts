import { patrolRules, type PatrolDifficulty } from '@/content/patrols';
import { supplyRules } from '@/content/supplyLines';

import { cellAt, cellsAlong, isScouted } from '../discovery/cells';
import { highestUnlockedTier } from '../expeditions/expeditions';
import { distanceMeters, interpolate } from '../generation/geo';
import { createRng } from '../generation/rng';
import { tileCenter } from '../generation/tiles';
import { windowIndex, windowRange } from '../generation/time';
import type { LatLng } from '../generation/types';
import { addMaterials } from '../inventory';
import { grantLoot } from '../loot/grant';
import { emptyLoot } from '../loot/types';
import { settleConsumables } from '../patrols/fight';
import type { PatrolKind, PatrolSpawn } from '../patrols/generate';
import { applyRunHp, currentHp, isExhausted, maxHp } from '../team/health';
import { isBusy } from '../team/team';
import type { SaveData } from '../save';
import { ambushChance, cellAmbusher, cellDangers, dangerContextOf } from './danger';
import { playPatrolFight, syntheticPatrol } from './fights';
import { settleCamp } from './production';
import { tradeLevel } from './trades';
import type { Cart, CartEvent, RoutePoint } from './types';

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** A stop on the route: a camp's cell centre, or a waypoint cell's centre. */
type Stop = { at: LatLng; campId: string | null };

/** The route's stops, dropping points whose camp no longer exists. */
function stopsOf(save: SaveData, route: RoutePoint[]): Stop[] {
  const stops: Stop[] = [];
  for (const point of route) {
    if ('camp' in point) {
      const camp = save.supply.camps.find((c) => c.id === point.camp);
      if (camp) stops.push({ at: tileCenter(camp.cell), campId: camp.id });
    } else {
      stops.push({ at: tileCenter(point.cell), campId: null });
    }
  }
  return stops;
}

/** The loop's path: the hall's centre, each point's centre, back to the hall. */
export function routePoints(save: SaveData, route: RoutePoint[]): LatLng[] {
  const hall = save.supply.hall;
  if (!hall) return [];
  const centre = tileCenter(hall.cell);
  return [centre, ...stopsOf(save, route).map((stop) => stop.at), centre];
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
    const steps = Math.ceil(leg / supplyRules.scoutStepMeters);
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

/** The danger level of each scouted crossing, one danger call per patrol window. */
function levelsOf(save: SaveData, crossed: { cell: string; at: number }[]): Map<string, 0 | 1 | 2 | 3> {
  const ctx = dangerContextOf(save);
  const byWindow = new Map<number, string[]>();
  for (const { cell, at } of crossed) {
    if (!isScouted(save.supply.scouted, cell)) continue;
    const w = windowIndex(at, patrolRules.windowMinutes);
    byWindow.set(w, [...(byWindow.get(w) ?? []), cell]);
  }
  const levels = new Map<string, 0 | 1 | 2 | 3>();
  for (const [w, cells] of byWindow) {
    const dangers = cellDangers(cells, windowRange(w, patrolRules.windowMinutes).start, ctx);
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
  const stops = stopsOf(save, cart.route);
  const points = routePoints(save, cart.route);
  const speedMps = cartSpeedMps(save);
  const capacity = cartCapacity(save);
  const crew = crewIds(cart);

  const events: CartEvent[] = [];
  let travelled = 0;
  for (let i = 0; i < stops.length; i++) {
    travelled += distanceMeters(points[i], points[i + 1]);
    const campId = stops[i].campId;
    if (campId) events.push({ at: at + (travelled / speedMps) * 1000, kind: 'camp', campId });
  }

  const crossed = crossings(points, at, speedMps);
  const levels = levelsOf(save, crossed);
  const ctx = dangerContextOf(save);
  const tier = highestUnlockedTier(save);
  let working = save;
  let lostAt: number | null = null;
  for (const { cell, at: crossingAt } of crossed) {
    const level = (levels.get(cell) ?? supplyRules.danger.unscoutedLevel) as 0 | 1 | 2 | 3;
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
  const endsAt = lostAt === null ? at + (routeLength(points) / speedMps) * 1000 : lostAt + supplyRules.cart.lostReturnMinutes * MINUTE;
  return { n, startedAt: at, endsAt, points, speedMps, capacity, events: kept };
}

/** Starts a loop at `at`: the plan is fixed, and the cargo starts empty. */
export function startLoop(save: SaveData, at: number, periodOffset = 0, n = 1): SaveData {
  const cart = save.supply.cart;
  return {
    ...save,
    supply: { ...save.supply, cart: { ...cart, loop: planLoop(save, at, n), cargo: {}, settledAt: at } },
  };
}

const stockTotal = (stock: Record<string, number>): number => Object.values(stock).reduce((sum, amount) => sum + amount, 0);

/** Loads the camp's stock up to the cart's free capacity, largest material first, ties by material id. */
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

/** Closes a finished loop at its end: delivers, pays the fights, logs it, and either parks or starts the next one. */
function finishLoop(save: SaveData, periodOffset: number): SaveData {
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
    ambush: first ? { cell: first.cell, kind: first.patrolKind, won: first.won } : null,
  };
  let route = cart.route;
  let nextRoute = cart.nextRoute;
  if (nextRoute !== null) {
    route = nextRoute;
    nextRoute = null;
  }
  const parked: Cart = {
    ...cart,
    route,
    nextRoute,
    cargo: {},
    log: [...cart.log, line].slice(-supplyRules.cart.logSize),
    settledAt: loop.endsAt,
  };
  next = { ...next, supply: { ...next.supply, cart: parked } };
  if (crewHurt(next, crew, loop.endsAt)) return { ...next, supply: { ...next.supply, cart: { ...parked, loop: null, waitingForCrew: true } } };
  const hasCamp = route.some((point) => 'camp' in point && next.supply.camps.some((camp) => camp.id === point.camp));
  if (!next.supply.hall || !hasCamp) return { ...next, supply: { ...next.supply, cart: { ...parked, loop: null } } };
  return startLoop(next, loop.endsAt, periodOffset, loop.n + 1);
}

/**
 * Settles the cart to `now`: the current loop's events play out in order, and
 * each finished loop delivers, pays its fights and starts the next one, so
 * one call replays every loop since the last settlement.
 */
export function settleCart(save: SaveData, now: number, periodOffset = 0): SaveData {
  let next = save;
  for (;;) {
    const cart = next.supply.cart;
    const loop = cart.loop;
    if (!loop) return next;

    const upto = Math.min(now, loop.endsAt);
    let cargo = cart.cargo;
    let camps = next.supply.camps;
    let changed = false;
    for (const event of loop.events) {
      if (event.at <= cart.settledAt || event.at > upto) continue;
      changed = true;
      if (event.kind === 'camp') {
        const index = camps.findIndex((camp) => camp.id === event.campId);
        if (index === -1) continue;
        const settled = settleCamp(next, camps[index], event.at, periodOffset);
        const loaded = loadStock(cargo, settled.stock, loop.capacity);
        cargo = loaded.cargo;
        camps = camps.map((camp, i) => (i === index ? { ...settled, stock: loaded.stock } : camp));
      } else if (event.won !== true) {
        cargo = {};
      }
    }
    if (changed) next = { ...next, supply: { ...next.supply, camps, cart: { ...next.supply.cart, cargo } } };
    if (loop.endsAt > now) return { ...next, supply: { ...next.supply, cart: { ...next.supply.cart, settledAt: now } } };
    next = finishLoop(next, periodOffset);
  }
}

/** What a route would mean: its path, length, loop time, each crossed cell's level now, and the chance of at least one ambush. */
export function routePreview(save: SaveData, route: RoutePoint[], now: number) {
  const points = routePoints(save, route);
  const meters = routeLength(points);
  const speedMps = cartSpeedMps(save);
  const crossed = routeCells(points);
  const scouted = crossed.filter((cell) => isScouted(save.supply.scouted, cell));
  const dangers = scouted.length > 0 ? cellDangers(scouted, now, dangerContextOf(save)) : {};
  const cells = crossed.map((cell) => ({
    cell,
    level: (dangers[cell]?.level ?? supplyRules.danger.unscoutedLevel) as 0 | 1 | 2 | 3,
  }));
  const ambushChanceTotal = 1 - cells.reduce((none, { level }) => none * (1 - ambushChance(level)), 1);
  return { points, meters, loopMinutes: meters / speedMps / 60, cells, ambushChance: ambushChanceTotal };
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
export function startCart(save: SaveData, now: number, periodOffset = 0): SaveData {
  const problem = cartProblem(save, now);
  if (problem) throw new Error(`Cannot start the cart: ${problem}`);
  const cart = save.supply.cart;
  const n = (cart.log.length > 0 ? cart.log[cart.log.length - 1].n : 0) + 1;
  return startLoop({ ...save, supply: { ...save.supply, cart: { ...cart, waitingForCrew: false } } }, now, periodOffset, n);
}

export type RouteProblem = 'unscoutedWaypoint' | 'noCamp' | null;

/** Why a route cannot be set, or null. */
export function routeProblem(save: SaveData, route: RoutePoint[]): RouteProblem {
  for (const point of route) {
    if ('camp' in point) {
      if (!save.supply.camps.some((camp) => camp.id === point.camp)) return 'noCamp';
    } else if (!isScouted(save.supply.scouted, point.cell)) return 'unscoutedWaypoint';
  }
  return null;
}

/** Sets the route: while a loop runs it applies at the next departure. */
export function setRoute(save: SaveData, route: RoutePoint[], _now: number): SaveData {
  const problem = routeProblem(save, route);
  if (problem) throw new Error(`Cannot set the route: ${problem}`);
  const cart = save.supply.cart;
  if (cart.loop) return { ...save, supply: { ...save.supply, cart: { ...cart, nextRoute: route } } };
  return { ...save, supply: { ...save.supply, cart: { ...cart, route } } };
}

/** Parks the cart: after the current loop, or at once when parked. */
export function stopCart(save: SaveData, _now: number): SaveData {
  const cart = save.supply.cart;
  if (cart.loop) return { ...save, supply: { ...save.supply, cart: { ...cart, nextRoute: [] } } };
  return { ...save, supply: { ...save.supply, cart: { ...cart, route: [] } } };
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
