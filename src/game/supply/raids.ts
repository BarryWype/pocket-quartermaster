import ngeohash from 'ngeohash';

import { supplyRules } from '@/content/supplyLines';

import { highestUnlockedTier } from '../expeditions/expeditions';
import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import { tileCenter } from '../generation/tiles';
import { grantLoot } from '../loot/grant';
import { settleConsumables } from '../patrols/fight';
import type { PatrolKind, PatrolSpawn } from '../patrols/generate';
import { dayKey } from '../rewards/chests';
import type { SaveData } from '../save';
import { isExhausted } from '../team/health';
import { isBusy } from '../team/team';
import type { HeroState } from '../types';
import { buildingCell } from './buildings';
import { cellAmbusher, cellDangers, dangerContextOf } from './danger';
import { patrolSpawnOf, playPatrolFight, syntheticPatrol } from './fights';
import { buildingStockTotal, settleBuilding, settleBuildings } from './production';
import { tradeLevel } from './trades';
import type { Raid } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const rules = supplyRules.raids;
const WEIGHT = { easy: 1, medium: 2, hard: 3 } as const;

/** A cell and its 8 neighbours: the ground a raid on a building comes from. */
const neighbourhood = (cell: string) => [cell, ...ngeohash.neighbors(cell)];

/** The end of the local day `now` falls in. */
function endOfDay(now: number): number {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return end.getTime();
}

/** The Watchman posted at a building, if any. */
function watchmanAt(save: SaveData, buildingId: string): HeroState | undefined {
  const heroId = save.supply.buildings.find((building) => building.id === buildingId)?.heroId;
  const hero = heroId ? save.heroes.find((h) => h.id === heroId) : undefined;
  return hero?.trade.id === 'watchman' ? hero : undefined;
}

/** How long before landing a raid is announced: longer while a Watchman is posted at the target. */
export function raidLeadMs(save: SaveData, raid: Raid): number {
  const watchman = watchmanAt(save, raid.buildingId);
  return (watchman ? rules.watchmanAnnounceHours[tradeLevel(watchman.trade.hours) - 1] : rules.announceHours) * HOUR;
}

export const raidAnnouncedAt = (save: SaveData, raid: Raid) => raid.landsAt - raidLeadMs(save, raid);

/** Whether the player knows of the raid: announced, and not landed yet. */
export const isAnnounced = (save: SaveData, raid: Raid, now: number) => !raid.result && now >= raidAnnouncedAt(save, raid);

/** The strongest patrol around a building when a raid lands, else a medium one of the tier's row. */
function raidersFor(save: SaveData, cell: string, at: number, seedKey: string): PatrolSpawn {
  const ctx = dangerContextOf(save);
  const found = neighbourhood(cell)
    .map((c) => cellAmbusher(c, at, ctx))
    .filter((spawn): spawn is PatrolSpawn => spawn !== null && spawn.difficulty !== null)
    .sort((a, b) => WEIGHT[b.difficulty!] - WEIGHT[a.difficulty!] || (a.id < b.id ? -1 : 1));
  return found[0] ?? syntheticPatrol(highestUnlockedTier(save), 'medium', seedKey, cell, at);
}

/**
 * Rolls today's raid once, on the first settle of the day: whether one lands,
 * when, on which building and by whom. Nothing is rolled while a raid is pending.
 */
export function rollRaidDay(save: SaveData, now: number): SaveData {
  const supply = save.supply;
  const today = dayKey(new Date(now));
  if (supply.raid || supply.raidDay === today) return save;
  const rolled: SaveData = { ...save, supply: { ...supply, raidDay: today } };
  const rng = createRng(`raid|${save.playerSeed}|${today}`);
  if (!supply.hall || supply.buildings.length === 0 || !rng.chance(rules.dailyChance)) return rolled;

  const away = now - supply.lastOpenAt >= rules.awayDays * DAY;
  const earliest = now + (rules.announceHours + (away ? rules.returnQuietHours : 0)) * HOUR;
  const end = endOfDay(now);
  if (earliest >= end) return rolled;
  const landsAt = Math.floor(earliest + rng.next() * (end - earliest));

  const ctx = dangerContextOf(save);
  const weights = supply.buildings.map((building) => {
    const stock = buildingStockTotal(settleBuilding(save, building, landsAt));
    if (stock === 0) return 0;
    const cells = neighbourhood(buildingCell(building));
    const dangers = cellDangers(cells, landsAt, ctx);
    return stock * (1 + cells.reduce((sum, cell) => sum + dangers[cell].level, 0) / cells.length);
  });
  if (weights.every((weight) => weight <= 0)) return rolled;
  const building = supply.buildings[rng.weighted(supply.buildings.map((_, i) => i), (i) => weights[i])];
  const raiders = raidersFor(save, buildingCell(building), landsAt, `raid-kind|${today}|${building.id}`);
  const raid: Raid = { buildingId: building.id, kind: raiders.kind as PatrolKind, tier: highestUnlockedTier(save), landsAt, defenders: [], result: null };
  return { ...rolled, supply: { ...rolled.supply, raid } };
}

/** The raiders as these fighters would meet them: easy with a Watchman among them, else medium. */
export function raidSpawn(save: SaveData, raid: Raid, fighters: string[]): PatrolSpawn {
  const building = save.supply.buildings.find((b) => b.id === raid.buildingId);
  const cell = building ? buildingCell(building) : save.supply.hall?.cell ?? '';
  const watchman = save.heroes.some((hero) => fighters.includes(hero.id) && hero.trade.id === 'watchman');
  return patrolSpawnOf(raid.kind, watchman ? 'easy' : 'medium', raid.tier, cell, raid.landsAt, `raid:${raid.landsAt}:${raid.buildingId}`);
}

/** How long defenders walk from the hall to a building. */
export function raidTravelMs(save: SaveData, buildingId: string): number {
  const hall = save.supply.hall;
  const building = save.supply.buildings.find((b) => b.id === buildingId);
  if (!hall || !building) return 0;
  return (distanceMeters(tileCenter(hall.cell), building.position) / ((rules.walkKmh * 1000) / 3600)) * 1000;
}

export type DefendProblem = 'noRaid' | 'resolved' | 'notAnnounced' | 'empty' | 'tooMany' | 'busy' | 'exhausted' | 'tooLate' | null;

/** Why these heroes can't be sent to defend the raided building now, or null. */
export function defendProblem(save: SaveData, heroIds: string[], now: number): DefendProblem {
  const raid = save.supply.raid;
  if (!raid || !save.supply.hall) return 'noRaid';
  if (raid.result) return 'resolved';
  if (!isAnnounced(save, raid, now)) return 'notAnnounced';
  if (heroIds.length === 0) return 'empty';
  if (raid.defenders.length + heroIds.length > rules.maxDefenders) return 'tooMany';
  for (const heroId of heroIds) {
    const hero = save.heroes.find((h) => h.id === heroId);
    if (!hero || isBusy(save, heroId)) return 'busy';
    if (isExhausted(hero, now)) return 'exhausted';
  }
  if (now + raidTravelMs(save, raid.buildingId) > raid.landsAt) return 'tooLate';
  return null;
}

/** Sends heroes from the hall to the raided building: they arrive after the walk. */
export function sendDefenders(save: SaveData, heroIds: string[], now: number): SaveData {
  const problem = defendProblem(save, heroIds, now);
  if (problem) throw new Error(`Cannot defend: ${problem}`);
  const raid = save.supply.raid!;
  const arrivesAt = now + raidTravelMs(save, raid.buildingId);
  const defenders = [...raid.defenders, ...heroIds.map((heroId) => ({ heroId, sentAt: now, arrivesAt }))];
  return { ...save, supply: { ...save.supply, raid: { ...raid, defenders } } };
}

/** When a sent defender is home: they wait at the building for the raid, then walk back as long as they walked out. */
export function defenderHomeAt(raid: Raid, defender: Raid['defenders'][number]): number {
  return defender.returnsAt ?? Math.max(defender.arrivesAt, raid.landsAt) + (defender.arrivesAt - defender.sentAt);
}

/**
 * Lands the pending raid at its time: the posted hero and the defenders who
 * arrived fight the raiders (easy with a Watchman among them, else medium).
 * A loss, or nobody there, takes the building's stock and closes it.
 */
export function resolveRaid(save: SaveData): SaveData {
  const raid = save.supply.raid;
  if (!raid || raid.result) return save;
  const at = raid.landsAt;
  let next = settleBuildings(save, at);
  const building = next.supply.buildings.find((b) => b.id === raid.buildingId);
  const defenders = raid.defenders.map((d) => ({ ...d, returnsAt: defenderHomeAt(raid, d) }));
  const log = (won: boolean | null, lost: Record<string, number>) =>
    [...next.supply.raidLog, { buildingId: raid.buildingId, landsAt: at, kind: raid.kind, won, lost }].slice(-10);

  if (!building) {
    return { ...next, supply: { ...next.supply, raid: { ...raid, defenders, result: { won: null, fighters: [] } }, raidLog: log(null, {}) } };
  }
  const arrived = raid.defenders.filter((d) => d.arrivesAt <= at).map((d) => d.heroId);
  const fighters = [...new Set([...(building.heroId ? [building.heroId] : []), ...arrived])];

  let won: boolean | null = null;
  if (fighters.length > 0) {
    const spawn = raidSpawn(next, raid, fighters);
    const fought = playPatrolFight(next, fighters, spawn, `raid|${at}|${building.id}`, at);
    won = fought.result.won;
    next = settleConsumables(fought.save, fighters, fought.result.salvaged);
    if (won) next = grantLoot(next, fighters, fought.result.rewards, at, 'patrol');
  }

  const lost = won === true ? {} : Object.fromEntries(Object.entries(building.stock).filter(([, amount]) => amount > 0));
  const buildings = next.supply.buildings.map((b) => {
    if (b.id !== building.id || won === true) return b;
    const unposted = won === false && b.heroId ? { heroId: null, postedAt: null } : {};
    return { ...b, stock: {}, progress: 0, closedUntil: at + rules.closedHours * HOUR, ...unposted };
  });
  return {
    ...next,
    supply: { ...next.supply, buildings, raid: { ...raid, defenders, result: { won, fighters } }, raidLog: log(won, lost) },
  };
}

/**
 * Settles raids to `now`: lands the pending one if due, lets defenders home
 * once walked back (the raid clears when the last one is), then rolls today.
 */
export function settleRaids(save: SaveData, now: number): SaveData {
  let next = save;
  const pending = next.supply.raid;
  if (pending && !pending.result && pending.landsAt <= now) next = resolveRaid(next);
  const raid = next.supply.raid;
  if (raid?.result) {
    const away = raid.defenders.filter((d) => defenderHomeAt(raid, d) > now);
    if (away.length !== raid.defenders.length || away.length === 0) {
      next = { ...next, supply: { ...next.supply, raid: away.length === 0 ? null : { ...raid, defenders: away } } };
    }
  }
  return rollRaidDay(next, now);
}

/** The next moment raids need settling: the announcement, the landing, or a defender's return. */
export function raidNextEventAt(save: SaveData, now: number): number | null {
  const raid = save.supply.raid;
  if (!raid) return null;
  if (!raid.result) {
    const announced = raidAnnouncedAt(save, raid);
    return announced > now ? announced : raid.landsAt;
  }
  const homes = raid.defenders.map((d) => defenderHomeAt(raid, d));
  return homes.length > 0 ? Math.min(...homes) : now;
}

/** Debug: a raid on this building, landing in two minutes, by whatever would raid it then. */
export function debugRaid(save: SaveData, buildingId: string, now: number): SaveData {
  const building = save.supply.buildings.find((b) => b.id === buildingId);
  if (!building) throw new Error(`Unknown building ${buildingId}`);
  const landsAt = now + 2 * 60_000;
  const raiders = raidersFor(save, buildingCell(building), landsAt, `raid-kind|debug|${now}|${building.id}`);
  const raid: Raid = { buildingId, kind: raiders.kind as PatrolKind, tier: highestUnlockedTier(save), landsAt, defenders: [], result: null };
  return { ...save, supply: { ...save.supply, raid } };
}
