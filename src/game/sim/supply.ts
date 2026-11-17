import { RARITIES } from '@/content/gear';
import { placeRules } from '@/content/places';
import { supplyRules } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { distanceMeters } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import { passRoute } from '../quests/progress';
import { patrolOdds } from '../patrols/fight';
import { build, buildProblem, buildingReach, openBuildingKinds } from '../supply/buildings';
import { cartProblem, setCrew, setRoute, startCart, stopCart } from '../supply/cart';
import { discoverAlong, discoverAt, networkPlacesAround } from '../supply/discovery';
import { hallProblem, placeHall } from '../supply/hall';
import { claimStep, deliverFromBag, deliverProblem, isOrderKind, orderProgress, reachedSteps, type Order } from '../supply/orders';
import { suggestOrder } from '../supply/planner';
import { postHero, recallPosted } from '../supply/postings';
import { buildingStockTotal, settleBuildings } from '../supply/production';
import { defendProblem, isAnnounced, raidSpawn, sendDefenders } from '../supply/raids';
import { settleNetwork } from '../supply/settle';
import { siteQuality } from '../supply/sites';
import type { BuildingKind } from '../supply/types';
import type { Loot } from '../loot/types';
import type { GearType } from '../types';
import { isExhausted } from '../team/health';
import { affinityOf, isBusy } from '../team/team';
import { highestTier, walkPoints, type Sim } from './bot';

const HOUR = 3_600_000;
const MINUTE = 60_000;
/** Odds runs per raid the bot weighs: few, like its other quick checks. */
const RAID_ODDS_RUNS = 40;

/** The tier the network opens at: nothing supply-related happens before it. */
const SUPPLY_TIER = 2;
/** The bot detours this far from a walk's points to discover the nearest site or order place. */
const DISCOVER_DETOUR_METERS = 400;
/** Gold the bot keeps on top of a building's cost before it spends it. */
const BUILD_GOLD_KEEP = 2;
/** What an order's headline is worth: a gear piece, more when a hero can wear its type, a meal or potion less. */
const GEAR_HEADLINE_VALUE = 10;
const WEARABLE_HEADLINE_VALUE = 5;
const ITEM_HEADLINE_VALUE = 4;

/** What the supply lines did over a run, for the report's Supply lines section. */
export type SupplyLog = {
  /** Units the cart delivered to the hall. */
  delivered: number;
  /** Units the buildings made. */
  made: number;
  /** Units the buildings made, by day: the by-tier comparison with walking. */
  madeByDay: Record<number, number>;
  /** Units delivered to order places, by the cart and by hand. */
  toPlacesByCart: number;
  toPlacesByHand: number;
  /** Gold orders paid: per unit delivered and per claimed step. */
  orderGold: number;
  stepsClaimed: number;
  headlinesClaimed: number;
  /** Sites and order places the bot discovered. */
  discoveredSites: number;
  discoveredPlaces: number;
  /** Buildings lost to expiry with stock still in them, and the units lost with them. */
  buildingsLostStocked: number;
  unitsLost: number;
  /** Order places the bot served and those that reached 100% before the place left. */
  ordersServed: number;
  ordersCompleted: number;
  ambushes: { won: number; lost: number; unguarded: number };
  raids: { won: number; lost: number; unguarded: number };
  /** Hero-hours spent posted at a building, and on the cart's crew. */
  postedHours: number;
  cartHours: number;
};

/** The bot's own bookkeeping between sessions. */
export type SupplySim = {
  log: SupplyLog;
  lastLoop: number;
  lastRaid: number;
  /** When each posted hero was posted, to count their hours at recall. */
  postedSince: Record<string, number>;
  /** Each building's `made` at the last tally. */
  lastMade: Record<string, number>;
  /** Order places the bot served (on the route or by hand), and those that reached 100% before they left. */
  served: Set<string>;
  completed: Set<string>;
};

export const emptySupplySim = (): SupplySim => ({
  log: {
    delivered: 0,
    made: 0,
    madeByDay: {},
    toPlacesByCart: 0,
    toPlacesByHand: 0,
    orderGold: 0,
    stepsClaimed: 0,
    headlinesClaimed: 0,
    discoveredSites: 0,
    discoveredPlaces: 0,
    buildingsLostStocked: 0,
    unitsLost: 0,
    ordersServed: 0,
    ordersCompleted: 0,
    ambushes: { won: 0, lost: 0, unguarded: 0 },
    raids: { won: 0, lost: 0, unguarded: 0 },
    postedHours: 0,
    cartHours: 0,
  },
  lastLoop: 0,
  lastRaid: 0,
  postedSince: {},
  lastMade: {},
  served: new Set(),
  completed: new Set(),
});

const outcome = (won: boolean | null) => (won === true ? 'won' : won === null ? 'unguarded' : 'lost');
const total = (goods: Record<string, number>) => Object.values(goods).reduce((sum, amount) => sum + amount, 0);

/** Counts the units buildings made since the last tally, and remembers where each stands now. */
function tallyMade(save: Sim['save'], supply: SupplySim, day: number) {
  const made = Object.fromEntries(save.supply.buildings.map((building) => [building.id, building.made]));
  for (const [id, now] of Object.entries(made)) {
    const units = Math.max(0, now - (supply.lastMade[id] ?? 0));
    supply.log.made += units;
    supply.log.madeByDay[day] = (supply.log.madeByDay[day] ?? 0) + units;
  }
  supply.lastMade = made;
}

/**
 * Settles the network to now and tallies what finished since: the buildings'
 * output (expiring buildings settled at their expiry first, so their lost
 * stock is counted before the network drops them), deliveries home and to
 * places, order gold, ambushes, raids and cart hours.
 */
function settle(sim: Sim, supply: SupplySim) {
  let working = sim.save;
  for (const expiresAt of [...new Set(working.supply.buildings.filter((b) => b.expiresAt <= sim.now).map((b) => b.expiresAt))].sort((a, b) => a - b)) {
    working = settleBuildings(working, expiresAt);
    tallyMade(working, supply, sim.day);
    for (const building of working.supply.buildings.filter((b) => b.expiresAt === expiresAt && buildingStockTotal(b) > 0)) {
      supply.log.buildingsLostStocked += 1;
      supply.log.unitsLost += buildingStockTotal(building);
    }
  }
  const before = working.supply.cart;
  const crew = (before.crew.driver ? 1 : 0) + before.crew.escorts.length;
  const loopStart = before.loop?.startedAt ?? null;
  sim.save = settleNetwork(working, sim.now);
  sim.save = { ...sim.save, supply: { ...sim.save.supply, lastOpenAt: sim.now } };
  tallyMade(sim.save, supply, sim.day);
  const { cart, raidLog } = sim.save.supply;
  const loops = cart.log.filter((line) => line.n > supply.lastLoop);
  for (const line of loops) {
    supply.log.delivered += total(line.delivered);
    for (const unload of line.places) {
      supply.log.toPlacesByCart += total(unload.goods);
      supply.log.orderGold += unload.gold;
    }
    if (line.ambush) supply.log.ambushes[outcome(line.ambush.won)] += 1;
  }
  if (loops.length > 0) {
    supply.lastLoop = loops[loops.length - 1].n;
    if (loopStart !== null) supply.log.cartHours += ((loops[loops.length - 1].endedAt - loopStart) / HOUR) * crew;
  }
  for (const line of raidLog.filter((entry) => entry.landsAt > supply.lastRaid)) {
    supply.log.raids[outcome(line.won)] += 1;
    supply.lastRaid = line.landsAt;
  }
  for (const order of Object.values(sim.save.supply.orders)) {
    if (supply.served.has(order.placeId) && orderProgress(order) >= 1) supply.completed.add(order.placeId);
  }
}

/** Pays every reached, unclaimed step of every order, at each session. */
function claimReachedSteps(sim: Sim, supply: SupplySim) {
  for (const order of Object.values(sim.save.supply.orders)) {
    for (const step of reachedSteps(order)) {
      if (order.steps[step].claimed) continue;
      const { save, paid } = claimStep(sim.save, order.placeId, step, sim.now);
      sim.save = save;
      supply.log.stepsClaimed += 1;
      if (order.steps[step].at === 1) supply.log.headlinesClaimed += 1;
      supply.log.orderGold += paid.gold;
    }
  }
}

/** Heroes free for supply work now: not busy, not knocked out, strongest first. */
const freeHeroes = (sim: Sim) =>
  sim.save.heroes.filter((hero) => !isBusy(sim.save, hero.id) && !isExhausted(hero, sim.now)).sort((a, b) => b.level - a.level);

/** What an order's headline is worth to the bot: a gear piece by its rarity and whether a roster hero can wear its type, a meal or potion headline less. */
function headlineValue(save: Sim['save'], headline: Loot): number {
  const [gear] = headline.gear;
  if (!gear) return ITEM_HEADLINE_VALUE;
  const usable = save.heroes.some((hero) => affinityOf(hero.classId, gear.itemId.replace(/\d+$/, '') as GearType) !== 'unfit');
  return GEAR_HEADLINE_VALUE + RARITIES.indexOf(gear.rarity) * 2 + (usable ? WEARABLE_HEADLINE_VALUE : 0);
}

/** The live, unfilled orders by the value of their headline to this roster, most valued first. */
function topOrders(save: Sim['save'], now: number): Order[] {
  return Object.values(save.supply.orders)
    .filter((order) => order.expiresAt > now && orderProgress(order) < 1)
    .sort((a, b) => headlineValue(save, b.headline) - headlineValue(save, a.headline) || a.expiresAt - b.expiresAt);
}

/** The building kind that serves a place kind; a market, like a tavern, by the farm. */
const servingKind = (kind: Order['kind']): BuildingKind =>
  (Object.keys(supplyRules.buildings.kinds) as BuildingKind[]).find((b) => supplyRules.buildings.kinds[b].for === kind) ?? 'farm';

/** The open building kind making the material the bot holds least of. */
const shortestKind = (save: Sim['save']): BuildingKind =>
  [...openBuildingKinds(save)].sort((a, b) => leastHeld(save, a) - leastHeld(save, b))[0];
const leastHeld = (save: Sim['save'], kind: BuildingKind) =>
  Math.min(...Object.keys(supplyRules.buildings.kinds[kind].makes).map((material) => save.materials[material] ?? 0));

/**
 * Builds, when a slot is free and it can pay (keeping the cost again in gold),
 * the kind serving the most valued order not already served by a building, or
 * else the kind making what it holds least of, on the best discovered site
 * within reach: highest quality, then nearest to the hall. The bot stands at
 * the site, as if it had walked there.
 */
function tryBuild(sim: Sim) {
  const save = sim.save;
  const hall = save.supply.hall;
  if (!hall) return;
  const reach = buildingReach(save);
  if (save.supply.buildings.length >= reach.count) return;
  const order = topOrders(save, sim.now).find((o) => !save.supply.buildings.some((building) => building.kind === servingKind(o.kind)));
  if (save.gold < BUILD_GOLD_KEEP * supplyRules.buildings.cost.gold) return;
  const centre = tileCenter(hall.cell);
  const site = networkPlacesAround(save, centre, sim.now)
    .filter((place) => place.kind === 'site' && place.id in save.supply.discovered && place.startsAt <= sim.now && sim.now < place.expiresAt)
    .filter((place) => distanceMeters(centre, place.position) <= reach.meters)
    .filter((place) => !save.supply.buildings.some((building) => building.siteId === place.id))
    .sort((a, b) => siteQuality(b) - siteQuality(a) || distanceMeters(centre, a.position) - distanceMeters(centre, b.position))[0];
  if (!site) return;
  const kind = order ? servingKind(order.kind) : shortestKind(save);
  if (buildProblem(save, site, kind, site.position, sim.now) !== null) return;
  sim.save = build(save, site, kind, site.position, sim.now);
}

/** An open Ride-the-route quest: the bot walks hall → each stop → hall when that loop fits in its walk. */
function rideRoute(sim: Sim) {
  const ride = sim.save.quests.list.find((quest) => quest.objective === 'rideRoute' && quest.doneAt === null && quest.route);
  const hallCell = sim.save.supply.hall?.cell;
  if (!ride || !hallCell) return;
  const hall = tileCenter(hallCell);
  const loop = [hall, ...ride.route!.stops.map((stop) => stop.position), hall];
  const meters = loop.slice(1).reduce((sum, point, i) => sum + distanceMeters(loop[i], point), 0);
  if (meters > sim.profile.walkMinutes * 60 * sim.config.walk.speed) return;
  for (const point of loop.slice(1)) sim.save = passRoute(sim.save, point, hall, sim.now);
}

/**
 * On a walk: discover the network places and sites the walk passes, detour to
 * the nearest undiscovered site and order place, and hand goods from the bag to
 * a discovered order place the walk passes (or detours to).
 */
export function supplyWalk(sim: Sim, supply: SupplySim) {
  if (highestTier(sim.save) < SUPPLY_TIER) return;
  const fixes = [
    ...walkPoints(sim),
    { position: sim.location, at: sim.now + sim.profile.walkMinutes * MINUTE },
  ].map(({ position, at }) => ({ position, timestamp: at }));
  const along = discoverAlong(sim.save, fixes, {});
  sim.save = along.save;
  for (const place of along.found) supply.log[place.kind === 'site' ? 'discoveredSites' : 'discoveredPlaces'] += 1;
  rideRoute(sim);

  const places = networkPlacesAround(sim.save, sim.location, sim.now).filter(
    (place) => place.startsAt <= sim.now && sim.now < place.expiresAt,
  );
  const detourMeters = (place: (typeof places)[number]) =>
    Math.min(...fixes.map((fix) => distanceMeters(fix.position, place.position)));
  const detours: (typeof places)[number][] = [];
  for (const pick of [
    places.filter((p) => p.kind === 'site' && !(p.id in sim.save.supply.discovered)).sort((a, b) => detourMeters(a) - detourMeters(b))[0],
    places.filter((p) => isOrderKind(p.kind) && !(p.id in sim.save.supply.discovered)).sort((a, b) => detourMeters(a) - detourMeters(b))[0],
  ]) {
    if (!pick || detourMeters(pick) > DISCOVER_DETOUR_METERS) continue;
    const step = discoverAt(sim.save, places, pick.position, sim.now);
    sim.save = step.save;
    supply.log[pick.kind === 'site' ? 'discoveredSites' : 'discoveredPlaces'] += step.found.length;
    detours.push(pick);
  }

  for (const place of places) {
    if (!isOrderKind(place.kind) || !(place.id in sim.save.supply.discovered)) continue;
    const at = [...fixes.map((fix) => fix.position), ...detours.map((detour) => detour.position)].find(
      (position) => distanceMeters(position, place.position) <= placeRules.interactionMeters,
    );
    if (!at || deliverProblem(sim.save, place.id, place.position, at) !== null) continue;
    const given = deliverFromBag(sim.save, place.id, place.position, at, sim.now);
    sim.save = given.save;
    supply.log.toPlacesByHand += total(given.delivered);
    supply.log.orderGold += given.gold;
    supply.served.add(place.id);
  }
}

/**
 * Before the session's sends: settle the network, claim every reached order
 * step, bring last night's posted heroes home, and stop the cart after its
 * loop so its crew is free again.
 */
export function supplyMorning(sim: Sim, supply: SupplySim, firstSession: boolean) {
  if (highestTier(sim.save) < SUPPLY_TIER) return;
  settle(sim, supply);
  claimReachedSteps(sim, supply);
  if (!firstSession) return;
  for (const [heroId, since] of Object.entries(supply.postedSince)) {
    if (sim.save.supply.buildings.some((building) => building.heroId === heroId)) sim.save = recallPosted(sim.save, heroId, sim.now);
    supply.log.postedHours += (sim.now - since) / HOUR;
  }
  supply.postedSince = {};
  if (sim.save.supply.cart.loop) sim.save = stopCart(sim.save, sim.now);
}

/**
 * After the session's sends: on a walk, place the hall at home; build when a
 * slot and a site allow it; defend an announced raid the odds favour; at the
 * day's last session, send the cart round the buildings and the places of the
 * top orders (the planner's order) with one spare escort, then post the heroes
 * still home.
 */
export function supplyEvening(sim: Sim, supply: SupplySim, walking: boolean, lastSession: boolean) {
  if (highestTier(sim.save) < SUPPLY_TIER) return;
  if (walking && !sim.save.supply.hall && hallProblem(sim.save, cellAt(sim.location), sim.now) === null) {
    sim.save = placeHall(sim.save, cellAt(sim.location), sim.now);
  }
  tryBuild(sim);

  const raid = sim.save.supply.raid;
  if (raid && !raid.result && raid.defenders.length === 0 && isAnnounced(sim.save, raid, sim.now)) {
    const party = freeHeroes(sim).slice(0, supplyRules.raids.maxDefenders).map((hero) => hero.id);
    const posted = sim.save.supply.buildings.find((building) => building.id === raid.buildingId)?.heroId;
    const fighters = [...(posted ? [posted] : []), ...party];
    if (party.length > 0 && defendProblem(sim.save, party, sim.now) === null) {
      const odds = patrolOdds(sim.save, raidSpawn(sim.save, raid, fighters), fighters, sim.now, RAID_ODDS_RUNS);
      if (odds.success >= sim.profile.oddsThreshold) sim.save = sendDefenders(sim.save, party, sim.now);
    }
  }

  if (!lastSession) return;
  const cart = sim.save.supply.cart;
  const hall = sim.save.supply.hall;
  if (!cart.loop && hall && sim.save.supply.buildings.length > 0) {
    // The route: the buildings, then the places of the top orders up to them, in the planner's order.
    const centre = tileCenter(hall.cell);
    const reach = buildingReach(sim.save).meters;
    const positions = new Map(networkPlacesAround(sim.save, centre, sim.now).map((place) => [place.id, place.position]));
    const served = topOrders(sim.save, sim.now)
      .slice(0, sim.save.supply.buildings.length)
      .flatMap((order) => {
        const position = positions.get(order.placeId);
        return position && distanceMeters(centre, position) <= reach ? [{ placeId: order.placeId, position }] : [];
      });
    for (const { placeId } of served) supply.served.add(placeId);
    const route = suggestOrder(sim.save, [
      ...sim.save.supply.buildings.map((building) => ({ building: building.id })),
      ...served.map(({ placeId, position }) => ({ place: placeId, position })),
    ]);
    const escort = freeHeroes(sim)[0];
    sim.save = setRoute(setCrew(sim.save, null, escort ? [escort.id] : [], sim.now), route, null, sim.now);
    // An escort too hurt to set out stays home; the cart goes without one.
    if (cartProblem(sim.save, sim.now) === 'crewHurt') sim.save = setCrew(sim.save, null, [], sim.now);
    if (cartProblem(sim.save, sim.now) === null) sim.save = startCart(sim.save, sim.now);
  }
  for (const building of sim.save.supply.buildings) {
    if (building.heroId) continue;
    const matching = supplyRules.matchingTrade[building.kind];
    const hero = freeHeroes(sim).sort((a, b) => Number(b.trade.id === matching) - Number(a.trade.id === matching))[0];
    if (!hero) break;
    sim.save = postHero(sim.save, building.id, hero.id, sim.now);
    supply.postedSince[hero.id] = sim.now;
  }
}
