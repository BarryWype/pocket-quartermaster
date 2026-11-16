import type { PatrolDifficulty } from '@/content/patrols';

import type { LatLng } from '../generation/types';
import type { RunResult } from '../expeditions/simulate';
import type { Loot } from '../loot/types';
import type { PatrolKind } from '../patrols/generate';
import type { ExpeditionReport } from '../types';

export type Terrain = 'green' | 'waterside' | 'built';

export type SupplyState = {
  /** First-run cards and one-line tips already shown. */
  seen: string[];
  /** The hall's cell, and when it last moved (once a week at most). */
  hall: { cell: string; movedAt: number } | null;
  /**
   * Scouted cells: by precision 5 prefix, then by the period each cell was last walked in,
   * the cells' 2-character suffixes back to back. A cell sits in one period only, so
   * walking it again moves it to the current one.
   */
  scouted: Record<string, Record<number, string>>;
  camps: Camp[];
  /** When each packed-up camp's slot frees again. */
  slotsFreeAt: number[];
  cart: Cart;
  raid: Raid | null;
  /** The last day a raid was rolled for, and the last time supply was settled with the app open (the 2-day rule). */
  raidDay: string | null;
  lastOpenAt: number;
  /** Raid outcomes for the Network tab, the last ten. */
  raidLog: RaidLogLine[];
  nextId: number;
};

export type Camp = {
  id: string;
  kind: 'timber' | 'trapper';
  cell: string;
  /** Fixed at founding, so production never needs map tiles. */
  terrain: Terrain;
  foundedAt: number;
  heroId: string | null;
  postedAt: number | null;
  /** Whole units on hand, and the fraction towards the next one. */
  stock: Record<string, number>;
  progress: number;
  /** Units made so far: seeds the trapper's per-unit roll, as jobs do. */
  made: number;
  settledAt: number;
  inspectedUntil: number;
  closedUntil: number;
};

export type RoutePoint = { camp: string } | { cell: string };

/** What happens on a loop: a camp call, or an ambush played out at departure. */
export type CartEvent =
  | { at: number; kind: 'camp'; campId: string }
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
  crew: { driver: string | null; escorts: string[] };
  /** The loop under way, fixed when it starts; null: parked at the hall. */
  loop: { n: number; startedAt: number; endsAt: number; points: LatLng[]; speedMps: number; capacity: number; events: CartEvent[] } | null;
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
  delivered: Record<string, number>;
  ambush: { cell: string; kind: PatrolKind; won: boolean | null } | null;
};

/**
 * A raid on a camp, fixed when its day is rolled. Its announcement follows
 * from the landing and the target's Watchman (see game/supply/raids.ts).
 */
export type Raid = {
  campId: string;
  kind: PatrolKind;
  tier: number;
  landsAt: number;
  /** Heroes sent from the hall; each stays listed until walked back home. */
  defenders: { heroId: string; sentAt: number; arrivesAt: number; returnsAt?: number }[];
  /** Set when the raid lands: null won means nobody was there. */
  result: { won: boolean | null; fighters: string[] } | null;
};

export type RaidLogLine = {
  campId: string;
  landsAt: number;
  kind: PatrolKind;
  won: boolean | null;
  lost: Record<string, number>;
};
