import type { PatrolDifficulty } from '@/content/patrols';

import type { LatLng } from '../generation/types';
import type { RunResult } from '../expeditions/simulate';
import type { Loot } from '../loot/types';
import type { PatrolKind } from '../patrols/generate';
import type { ExpeditionReport } from '../types';
import type { Order } from './orders';

export type Terrain = 'green' | 'waterside' | 'built';

export type SupplyState = {
  /** First-run cards and one-line tips already shown. */
  seen: string[];
  /** The hall's cell, and the times of the moves made in the last 7 days (the first placement isn't one). */
  hall: { cell: string; moves: number[] } | null;
  buildings: Building[];
  /** The period's personal site check (see supply/sites.ts): the spot it settled on, or null when the world covers the origin. */
  personalSite: { period: number; spot: { id: string; position: LatLng; roll: number } | null } | null;
  cart: Cart;
  raid: Raid | null;
  /** The last day a raid was rolled for, and the last time supply was settled with the app open (the 2-day rule). */
  raidDay: string | null;
  lastOpenAt: number;
  /** Raid outcomes for the Network tab, the last ten. */
  raidLog: RaidLogLine[];
  /** Network places the player walked to: place id → its expiresAt, pruned once expired. */
  discovered: Record<string, number>;
  /** The orders of the discovered places: place id → its order, until the place leaves. */
  orders: Record<string, Order>;
  nextId: number;
};

export type BuildingKind = 'farm' | 'quarry' | 'herbGarden';
export type Building = {
  id: string;
  kind: BuildingKind;
  siteId: string;
  /** The site's placed position (what the map shows). */
  position: LatLng;
  quality: 1 | 2 | 3;
  builtAt: number;
  /** Building resets the site's life: six days from builtAt. */
  expiresAt: number;
  heroId: string | null;
  postedAt: number | null;
  stock: Record<string, number>;
  progress: number;
  made: number;
  settledAt: number;
  inspectedUntil: number;
  closedUntil: number;
};

/**
 * A building on the route, a discovered order place (its placed position is
 * stored, so settling never regenerates places), or a street point the player
 * forced the route through.
 */
export type RoutePoint = { building: string } | { place: string; position: LatLng } | { via: LatLng };

/** The path the cart drives: its points, where each stop sits on it, and which legs fell back to a straight line. */
export type StreetPath = { points: LatLng[]; stopAt: number[]; straightLegs: number[] };

/** What was unloaded at a place on a loop, and the gold it paid. */
export type CartPlaceLine = { placeId: string; goods: Record<string, number>; gold: number };

/** What happens on a loop: a building call, a place unload, or an ambush played out at departure. */
export type CartEvent =
  | { at: number; kind: 'building'; buildingId: string }
  | { at: number; kind: 'place'; placeId: string }
  | {
      at: number;
      kind: 'ambush';
      cell: string;
      patrolKind: PatrolKind;
      difficulty: PatrolDifficulty;
      /** null: nobody aboard, so no fight was played. */
      won: boolean | null;
      hp: RunResult['hp'];
      salvaged: ExpeditionReport['salvaged'];
      rewards: Loot;
    };

export type Cart = {
  /** The loop the cart runs; empty: parked at the hall. */
  route: RoutePoint[];
  /** A route changed mid-loop: applies at the next departure. */
  nextRoute: RoutePoint[] | null;
  /** The street path of the route, found when the route was set. */
  path: StreetPath | null;
  /** The path of a route changed mid-loop, applied with it. */
  nextPath: StreetPath | null;
  crew: { driver: string | null; escorts: string[] };
  /** The loop under way, fixed when it starts; null: parked at the hall. */
  loop: {
    n: number;
    startedAt: number;
    endsAt: number;
    points: LatLng[];
    speedMps: number;
    capacity: number;
    events: CartEvent[];
    /** What has been unloaded at places so far, for the log line when the loop ends. */
    unloaded: CartPlaceLine[];
  } | null;
  cargo: Record<string, number>;
  settledAt: number;
  /** Someone came home too hurt: the cart waits for the player. */
  waitingForCrew: boolean;
  /** The last ten loops. */
  log: CartLogLine[];
};

export type CartLogLine = {
  n: number;
  endedAt: number;
  /** What reached the hall. */
  delivered: Record<string, number>;
  /** What was unloaded at places on the way, and the gold each paid. */
  places: CartPlaceLine[];
  ambush: { cell: string; kind: PatrolKind; won: boolean | null } | null;
};

/**
 * A raid on a building, fixed when its day is rolled. Its announcement follows
 * from the landing and the target's Watchman (see game/supply/raids.ts).
 */
export type Raid = {
  buildingId: string;
  kind: PatrolKind;
  tier: number;
  landsAt: number;
  /** Heroes sent from the hall; each stays listed until walked back home. */
  defenders: { heroId: string; sentAt: number; arrivesAt: number; returnsAt?: number }[];
  /** Set when the raid lands: null won means nobody was there. */
  result: { won: boolean | null; fighters: string[] } | null;
};

export type RaidLogLine = {
  buildingId: string;
  landsAt: number;
  kind: PatrolKind;
  won: boolean | null;
  lost: Record<string, number>;
};
