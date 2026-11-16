import { supplyRules, campResource, type SupplyResource } from '@/content/supplyLines';

import { cellAt, cellsAlong } from '../discovery/cells';
import { distanceMeters, offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import { tileCenter } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import { patrolOdds } from '../patrols/fight';
import { campProblem, foundCamp } from '../supply/camps';
import { cartProblem, setCrew, setRoute, startCart, stopCart } from '../supply/cart';
import { hallProblem, placeHall, scoutPath } from '../supply/hall';
import { periodAt } from '../supply/period';
import { postHero, recallPosted } from '../supply/postings';
import { defendProblem, isAnnounced, raidSpawn, sendDefenders } from '../supply/raids';
import { cellRichness } from '../supply/richness';
import { settleNetwork } from '../supply/settle';
import type { Camp, Terrain } from '../supply/types';
import { isExhausted } from '../team/health';
import { isBusy } from '../team/team';
import type { Sim } from './bot';

const HOUR = 3_600_000;
/** Odds runs per raid the bot weighs: few, like its other quick checks. */
const RAID_ODDS_RUNS = 40;
/**
 * The sim has no map tiles, so a cell's terrain is drawn at the shares
 * measured around the Wellington fixture (see doc/design/supply-lines/).
 */
const TERRAIN_SHARES: [Terrain, number][] = [
  ['green', 0.31],
  ['waterside', 0.24],
  ['built', 0.45],
];

/** What the supply lines did over a run, for the report's Supply lines section. */
export type SupplyLog = {
  /** Units the cart delivered to the hall. */
  delivered: number;
  /** Camps founded. */
  camps: number;
  ambushes: { won: number; lost: number; unguarded: number };
  raids: { won: number; lost: number; unguarded: number };
  /** Hero-hours spent posted at a camp, and on the cart's crew. */
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
};

export const emptySupplySim = (): SupplySim => ({
  log: { delivered: 0, camps: 0, ambushes: { won: 0, lost: 0, unguarded: 0 }, raids: { won: 0, lost: 0, unguarded: 0 }, postedHours: 0, cartHours: 0 },
  lastLoop: 0,
  lastRaid: 0,
  postedSince: {},
});

export const simTerrain = (cell: string): Terrain => createRng(`terrain|${cell}`).weighted(TERRAIN_SHARES, ([, share]) => share)[0];

const outcome = (won: boolean | null) => (won === true ? 'won' : won === null ? 'unguarded' : 'lost');

/** Settles the network to now and tallies what finished since: deliveries, ambushes, raids and cart hours. */
function settle(sim: Sim, supply: SupplySim) {
  const before = sim.save.supply.cart;
  const crew = (before.crew.driver ? 1 : 0) + before.crew.escorts.length;
  const loopStart = before.loop?.startedAt ?? null;
  sim.save = settleNetwork(sim.save, sim.now);
  sim.save = { ...sim.save, supply: { ...sim.save.supply, lastOpenAt: sim.now } };
  const { cart, raidLog } = sim.save.supply;
  const loops = cart.log.filter((line) => line.n > supply.lastLoop);
  for (const line of loops) {
    supply.log.delivered += Object.values(line.delivered).reduce((sum, amount) => sum + amount, 0);
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
}

/** The day's walk as a triangle loop from home, as long as the profile's walks, on a bearing that changes daily. */
function walkLoop(sim: Sim): LatLng[] {
  const meters = sim.profile.walkHours.length * sim.profile.walkMinutes * 60 * sim.config.walk.speed;
  const side = meters / 3;
  const bearing = createRng(`supply-walk|${sim.day}`).next() * 2 * Math.PI;
  const at = (angle: number) => offsetPosition(sim.location, side * Math.cos(angle), side * Math.sin(angle));
  return [sim.location, at(bearing), at(bearing + Math.PI / 3), sim.location];
}

/** The best camp the day's walk passed: the richest resource on ground that grows it, near the hall and free. */
function bestCampSite(sim: Sim, cells: string[]): { kind: Camp['kind']; cell: string; terrain: Terrain } | null {
  const period = periodAt(sim.now);
  let best: { kind: Camp['kind']; cell: string; terrain: Terrain; richness: number } | null = null;
  for (const cell of new Set(cells)) {
    const terrain = simTerrain(cell);
    for (const kind of ['timber', 'trapper'] as Camp['kind'][]) {
      const richness = cellRichness(cell, period, terrain, campResource[kind] as SupplyResource);
      if (richness === 0 || (best && richness <= best.richness)) continue;
      if (campProblem(sim.save, kind, cell, terrain, cell, sim.now) !== null) continue;
      best = { kind, cell, terrain, richness };
    }
  }
  return best;
}

/** Heroes free for supply work now: not busy, not knocked out, strongest first. */
const freeHeroes = (sim: Sim) =>
  sim.save.heroes.filter((hero) => !isBusy(sim.save, hero.id) && !isExhausted(hero, sim.now)).sort((a, b) => b.level - a.level);

/**
 * Before the session's sends: settle the network, bring last night's posted
 * heroes home, and stop the cart after its loop so its crew is free again.
 */
export function supplyMorning(sim: Sim, supply: SupplySim, firstSession: boolean) {
  settle(sim, supply);
  if (!firstSession) return;
  for (const [heroId, since] of Object.entries(supply.postedSince)) {
    if (sim.save.supply.camps.some((camp) => camp.heroId === heroId)) sim.save = recallPosted(sim.save, heroId, sim.now);
    supply.log.postedHours += (sim.now - since) / HOUR;
  }
  supply.postedSince = {};
  if (sim.save.supply.cart.loop) sim.save = stopCart(sim.save, sim.now);
}

/**
 * After the session's sends: on a walk, place the hall at home, scout the
 * walk's cells and found a camp on the best of them; defend an announced raid
 * the odds favour; at the day's last session, send the cart round every camp
 * with one spare escort, then post the heroes still home.
 */
export function supplyEvening(sim: Sim, supply: SupplySim, walking: boolean, lastSession: boolean) {
  if (walking) {
    if (!sim.save.supply.hall && hallProblem(sim.save, cellAt(sim.location), sim.now) === null) {
      sim.save = placeHall(sim.save, cellAt(sim.location), sim.now);
    }
    const loop = walkLoop(sim);
    sim.save = scoutPath(sim.save, loop, periodAt(sim.now));
    const site = bestCampSite(sim, loop.slice(1).flatMap((to, i) => cellsAlong(loop[i], to)));
    if (site) {
      sim.save = foundCamp(sim.save, site.kind, site.cell, site.terrain, site.cell, sim.now);
      supply.log.camps += 1;
    }
  }

  const raid = sim.save.supply.raid;
  if (raid && !raid.result && raid.defenders.length === 0 && isAnnounced(sim.save, raid, sim.now)) {
    const party = freeHeroes(sim).slice(0, supplyRules.raids.maxDefenders).map((hero) => hero.id);
    const posted = sim.save.supply.camps.find((camp) => camp.id === raid.campId)?.heroId;
    const fighters = [...(posted ? [posted] : []), ...party];
    if (party.length > 0 && defendProblem(sim.save, party, sim.now) === null) {
      const odds = patrolOdds(sim.save, raidSpawn(sim.save, raid, fighters), fighters, sim.now, RAID_ODDS_RUNS);
      if (odds.success >= sim.profile.oddsThreshold) sim.save = sendDefenders(sim.save, party, sim.now);
    }
  }

  if (!lastSession) return;
  const cart = sim.save.supply.cart;
  const hall = sim.save.supply.hall;
  if (!cart.loop && hall && sim.save.supply.camps.length > 0) {
    // The direct route: the camps nearest the hall first.
    const route = [...sim.save.supply.camps]
      .sort((a, b) => distanceMeters(tileCenter(hall.cell), tileCenter(a.cell)) - distanceMeters(tileCenter(hall.cell), tileCenter(b.cell)))
      .map((camp) => ({ camp: camp.id }));
    const escort = freeHeroes(sim)[0];
    sim.save = setRoute(setCrew(sim.save, null, escort ? [escort.id] : [], sim.now), route, sim.now);
    // An escort too hurt to set out stays home; the cart goes without one.
    if (cartProblem(sim.save, sim.now) === 'crewHurt') sim.save = setCrew(sim.save, null, [], sim.now);
    if (cartProblem(sim.save, sim.now) === null) sim.save = startCart(sim.save, sim.now);
  }
  for (const camp of sim.save.supply.camps) {
    if (camp.heroId) continue;
    const matching = supplyRules.matchingTrade[camp.kind];
    const hero = freeHeroes(sim).sort((a, b) => Number(b.trade.id === matching) - Number(a.trade.id === matching))[0];
    if (!hero) break;
    sim.save = postHero(sim.save, camp.id, hero.id, sim.now);
    supply.postedSince[hero.id] = sim.now;
  }
}
