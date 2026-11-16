import { supplyRules } from '@/content/supplyLines';

import { cellAt } from '../discovery/cells';
import { distanceMeters } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import { patrolOdds } from '../patrols/fight';
import { cartProblem, setCrew, setRoute, startCart, stopCart } from '../supply/cart';
import { hallProblem, placeHall } from '../supply/hall';
import { postHero, recallPosted } from '../supply/postings';
import { defendProblem, isAnnounced, raidSpawn, sendDefenders } from '../supply/raids';
import { settleNetwork } from '../supply/settle';
import { isExhausted } from '../team/health';
import { isBusy } from '../team/team';
import type { Sim } from './bot';

const HOUR = 3_600_000;
/** Odds runs per raid the bot weighs: few, like its other quick checks. */
const RAID_ODDS_RUNS = 40;

/** What the supply lines did over a run, for the report's Supply lines section. */
export type SupplyLog = {
  /** Units the cart delivered to the hall. */
  delivered: number;
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
  log: { delivered: 0, ambushes: { won: 0, lost: 0, unguarded: 0 }, raids: { won: 0, lost: 0, unguarded: 0 }, postedHours: 0, cartHours: 0 },
  lastLoop: 0,
  lastRaid: 0,
  postedSince: {},
});

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
 * After the session's sends: on a walk, place the hall at home; defend an
 * announced raid the odds favour; at the day's last session, send the cart
 * round every camp with one spare escort, then post the heroes still home.
 * Nothing here founds a camp, so with none the cart and postings idle.
 */
export function supplyEvening(sim: Sim, supply: SupplySim, walking: boolean, lastSession: boolean) {
  if (walking && !sim.save.supply.hall && hallProblem(sim.save, cellAt(sim.location), sim.now) === null) {
    sim.save = placeHall(sim.save, cellAt(sim.location), sim.now);
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
