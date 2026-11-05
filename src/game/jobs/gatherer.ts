import { gatheringConfig } from '@/content/gatheringConfig';
import { gathererRules, jobById } from '@/content/jobs';
import { resources } from '@/content/resources';
import { spawnConfig } from '@/content/spawnConfig';

import { spawnPositionAt } from '../generation/animalPaths';
import { distanceMeters, interpolate } from '../generation/geo';
import { createRng } from '../generation/rng';
import { generateTileSpawns } from '../generation/spawns';
import { tilesWithin } from '../generation/tiles';
import { windowIndex, windowRange } from '../generation/time';
import type { LatLng, ResourceKind, Spawn } from '../generation/types';
import { canGather, localDayKey, spawnYield } from '../gathering/gathering';
import { readSpawn } from '../gathering/lockedNodes';
import { isRevealed } from '../reveal/reveal';
import type { GathererAnchor, JobOutput, SaveData } from '../save';
import { maxHp } from '../team/health';
import type { HeroState, MaterialStack } from '../types';
import { cycleAt, cycleOf, jobWorker, timeOf } from './jobs';

const MINUTE = 60_000;
const KINDS = Object.keys(spawnConfig.kinds) as ResourceKind[];

/** A full gatherer output holds this many gathered nodes. */
export const gathererCapNodes = () => Math.floor((gathererRules.capHours * 60) / gathererRules.minMinutesPerNode);

/** One node the gatherer took: when it finished, where it stood, what it gave, and the HP it cost the worker (0 when none). */
export type FoundNode = { spawn: Spawn; at: number; position: LatLng; gained: MaterialStack[]; wound: number };

/** The node the hero is on its way to (or gathering at), not finished yet. */
export type GathererLeg = { spawnId: string; from: LatLng; to: LatLng; startAt: number; arriveAt: number; finishAt: number };

export type GathererWound = { at: number; heroId: string; hp: number };

/** What a replay found, and where it left the hero: the next replay picks up from there. */
export type GathererReplay = {
  nodes: FoundNode[];
  leg: GathererLeg | null;
  /** When the hero next looks for a node. */
  nextAt: number;
  /** Where the hero stands after its last node, if any. */
  heroAt: LatLng | null;
  /** The anchor (its `at`) the last node was picked around: the hero keeps its place only while that anchor holds. */
  heroAnchorAt: number | null;
  lastNodeAt: number | null;
};

const mod = (x: number, m: number) => ((x % m) + m) % m;

/** When the worker has put in `need` more hours of work from `at` on, rest phases aside. */
function workEndsAt(hero: HeroState, at: number, need: number): number {
  const { d, c } = cycleOf(hero);
  let x = cycleAt(hero, at);
  for (;;) {
    const m = mod(x, c);
    if (m >= d) x += c - m;
    else if (need <= d - m) return timeOf(hero, x + need);
    else {
      need -= d - m;
      x += c - m;
    }
  }
}

/** The anchor in effect at `at`: the last point at or before it. */
const anchorAt = (anchors: GathererAnchor[], at: number): GathererAnchor | null => {
  let found: GathererAnchor | null = null;
  for (const anchor of anchors) {
    if (anchor.at > at) break;
    found = anchor;
  }
  return found;
};

/** Keeps the points from `keepFrom` on, plus the one in effect at it. */
export function pruneAnchors(anchors: GathererAnchor[], keepFrom: number): GathererAnchor[] {
  const first = anchors.findLastIndex((anchor) => anchor.at <= keepFrom);
  return first <= 0 ? anchors : anchors.slice(first);
}

/** When the replay next starts, so older anchors can go: the hero's next look, or now with nobody at work. */
export const anchorsKeepFrom = (save: SaveData, now: number) =>
  jobWorker(save, 'gatherer') ? Math.min(now, save.jobOutput.gatherer?.nextAt ?? save.jobOutput.gatherer?.since ?? now) : now;

/**
 * Notes where the player is: a new anchor point once they are `anchorMoveMeters`
 * from the last one and `anchorEveryMinutes` after it. Points out of time order
 * are dropped. Returns the same save when nothing changed.
 */
export function addAnchor(save: SaveData, position: LatLng, at: number): SaveData {
  const anchors = save.gatherer.anchors;
  const last = anchors[anchors.length - 1];
  if (last) {
    if (at < last.at + gathererRules.anchorEveryMinutes * MINUTE) return save;
    if (distanceMeters(last.position, position) <= gathererRules.anchorMoveMeters) return save;
  }
  const next = pruneAnchors([...anchors, { position, at }], anchorsKeepFrom(save, at));
  return { ...save, gatherer: { ...save.gatherer, anchors: next } };
}

/** Notes the walk's accurate fixes as anchors, in time order (Pocket mode's buffer, when the app processes it). */
export function addAnchorsFromFixes(save: SaveData, fixes: { position: LatLng; accuracy: number | null; timestamp: number }[]): SaveData {
  const accurate = fixes.filter((fix) => fix.accuracy === null || fix.accuracy <= gatheringConfig.autoGather.maxAccuracyMeters);
  return [...accurate].sort((a, b) => a.timestamp - b.timestamp).reduce((next, fix) => addAnchor(next, fix.position, fix.timestamp), save);
}

/**
 * Replays the gatherer from where the last replay left it up to `to`: at each
 * look, the hero takes the closest node it can reach before it expires, among
 * those the player would see on the map from the anchor (same range, reveals
 * and pickaxe rules, not collected), focus first. Each node costs the walk
 * from where the hero stands plus the gather time, and finishes no sooner than
 * `minMinutesPerNode` after the last one; with nothing in reach the hero looks
 * again after that long, or when the anchor moves. When the anchor moves, the
 * hero starts again from it. Rest phases pause everything. Nodes that finish
 * after `from` and by `to` are returned, at most up to the output's cap.
 */
export function gathererFinds(save: SaveData, jobId: string, from: number, to: number): GathererReplay {
  const worker = jobWorker(save, jobId);
  const entry = save.jobOutput[jobId];
  const anchors = save.gatherer.anchors;
  const empty: GathererReplay = {
    nodes: [],
    leg: null,
    nextAt: to,
    heroAt: entry?.heroAt ?? null,
    heroAnchorAt: entry?.heroAnchorAt ?? null,
    lastNodeAt: entry?.lastNodeAt ?? null,
  };
  if (!worker?.job || !entry || jobById[jobId]?.kind !== 'outdoor' || anchors.length === 0) return empty;
  const shows = (kind: ResourceKind) => isRevealed(save, kind === 'animal' ? 'animals' : 'resources');
  if (!KINDS.some(shows)) return empty;
  const cap = gathererCapNodes();
  let taken = entry.nodes ?? 0;
  const since = worker.job.since;
  const pace = gathererRules.minMinutesPerNode * MINUTE;
  const focus = save.gatherer.focus === 'any' ? null : gathererRules.focus[save.gatherer.focus];
  const { d, c } = cycleOf(worker);

  // Tiles are generated once per kind, tile and window.
  const generated = new Map<string, Spawn[]>();
  const tileSpawns = (kind: ResourceKind, tile: string, window: number) => {
    const key = `${kind}|${tile}|${window}`;
    if (!generated.has(key)) generated.set(key, generateTileSpawns(kind, tile, window));
    return generated.get(key)!;
  };
  /** The nodes the player would see from the anchor at `at`, with where each stands then. */
  const inSight = (anchor: GathererAnchor, at: number) => {
    const out: { spawn: Spawn; position: LatLng }[] = [];
    for (const kind of KINDS) {
      if (!shows(kind)) continue;
      const { precision, windowMinutes, visibilityMeters } = spawnConfig.kinds[kind];
      const window = windowIndex(at, windowMinutes);
      if (windowRange(window, windowMinutes).start > at) continue;
      for (const tile of tilesWithin(anchor.position, visibilityMeters, precision)) {
        for (const spawn of tileSpawns(kind, tile, window)) {
          const position = spawnPositionAt(spawn, at);
          if (distanceMeters(anchor.position, position) <= visibilityMeters) out.push({ spawn, position });
        }
      }
    }
    return out;
  };

  const nodes: FoundNode[] = [];
  const took = new Set<string>();
  let clock = Math.max(entry.nextAt ?? since, since);
  let heroAt = entry.heroAt ?? null;
  let heroAnchorAt = entry.heroAnchorAt ?? null;
  let lastNodeAt = entry.lastNodeAt ?? null;
  let leg: GathererLeg | null = null;

  while (taken < cap) {
    // A look during a rest phase waits for the next work phase.
    const x = cycleAt(worker, clock);
    if (mod(x, c) >= d) clock = timeOf(worker, x + c - mod(x, c));
    if (clock >= to) break;
    const anchor = anchorAt(anchors, clock);
    const nextAnchor = anchors.find((a) => a.at > clock);
    if (!anchor) {
      clock = nextAnchor!.at;
      continue;
    }
    // The hero starts from the anchor, unless its last node was picked around this same anchor.
    const start = heroAt && heroAnchorAt === anchor.at && lastNodeAt !== null && lastNodeAt >= since ? heroAt : anchor.position;
    const candidates = inSight(anchor, clock)
      .filter(({ spawn }) => !(spawn.id in save.collected) && !took.has(spawn.id) && canGather(save, spawn))
      .map((node) => ({ ...node, distance: distanceMeters(start, node.position) }))
      .sort((a, b) => a.distance - b.distance || (a.spawn.id < b.spawn.id ? -1 : 1));
    const ordered = focus
      ? [...candidates.filter(({ spawn }) => focus.includes(spawn.kind)), ...candidates.filter(({ spawn }) => !focus.includes(spawn.kind))]
      : candidates;
    let picked: (typeof ordered)[number] | null = null;
    let arriveAt = 0;
    let finishAt = 0;
    for (const node of ordered) {
      const walkMinutes = node.distance / gathererRules.heroWalkMetersPerMinute;
      const arrive = workEndsAt(worker, clock, walkMinutes / 60);
      const finish = Math.max(workEndsAt(worker, clock, (walkMinutes + gathererRules.gatherMinutes) / 60), (lastNodeAt ?? -Infinity) + pace);
      if (finish >= node.spawn.expiresAt) continue;
      picked = node;
      arriveAt = arrive;
      finishAt = finish;
      break;
    }
    if (!picked) {
      clock = Math.min(clock + pace, nextAnchor?.at ?? Infinity);
      continue;
    }
    if (finishAt > to) {
      leg = { spawnId: picked.spawn.id, from: start, to: picked.position, startAt: clock, arriveAt, finishAt };
      break;
    }
    took.add(picked.spawn.id);
    if (finishAt > from) {
      taken++;
      nodes.push({
        spawn: picked.spawn,
        at: finishAt,
        position: picked.position,
        gained: spawnYield(picked.spawn, resources, readSpawn(save, picked.spawn).resourceId),
        wound: createRng(`gatherer|wound|${picked.spawn.id}`).chance(gathererRules.woundChancePerNode)
          ? gathererRules.woundHpShare * maxHp(save, worker)
          : 0,
      });
    }
    heroAt = picked.position;
    heroAnchorAt = anchor.at;
    lastNodeAt = finishAt;
    clock = finishAt;
  }
  return { nodes, leg, nextAt: clock, heroAt, heroAnchorAt, lastNodeAt };
}

/** The gatherer's node count now: the settled ones plus those found since, capped at the cap. */
export function gathererNodesNow(save: SaveData, jobId: string, now: number): number {
  const entry = save.jobOutput[jobId];
  if (!entry) return 0;
  return (entry.nodes ?? 0) + gathererFinds(save, jobId, entry.since, now).nodes.length;
}

/**
 * The gatherer's output entry settled to `now`, plus just the fresh wounds, for
 * settling the hero's HP, and the nodes it took, for `save.collected`.
 */
export function gathererDetail(
  save: SaveData,
  jobId: string,
  now: number,
): { entry: JobOutput; wounds: GathererWound[]; collected: Record<string, number> } {
  const entry = save.jobOutput[jobId];
  const worker = jobWorker(save, jobId);
  if (!entry) return { entry: { amounts: {}, fraction: 0, units: 0, since: now }, wounds: [], collected: {} };
  if (!worker) return { entry: { ...entry, since: now }, wounds: [], collected: {} };
  const replay = gathererFinds(save, jobId, entry.since, now);
  const amounts = { ...entry.amounts };
  let today = entry.today;
  for (const node of replay.nodes) {
    for (const gained of node.gained) amounts[gained.materialId] = (amounts[gained.materialId] ?? 0) + gained.amount;
    const day = localDayKey(node.at);
    today = { day, nodes: (today?.day === day ? today.nodes : 0) + 1 };
  }
  const wounds = replay.nodes
    .filter((node) => node.wound > 0)
    .map((node): GathererWound => ({ at: node.at, heroId: worker.id, hp: node.wound }));
  return {
    entry: {
      ...entry,
      amounts,
      fraction: 0,
      units: entry.units + replay.nodes.length,
      nodes: (entry.nodes ?? 0) + replay.nodes.length,
      nextAt: replay.nextAt,
      ...(replay.lastNodeAt !== null ? { lastNodeAt: replay.lastNodeAt } : {}),
      ...(replay.heroAt ? { heroAt: replay.heroAt } : {}),
      ...(replay.heroAnchorAt !== null ? { heroAnchorAt: replay.heroAnchorAt } : {}),
      ...(today ? { today } : {}),
      wounds: [...(entry.wounds ?? []), ...wounds],
      since: now,
    },
    wounds,
    collected: Object.fromEntries(replay.nodes.map((node) => [node.spawn.id, node.spawn.expiresAt])),
  };
}

/** Nodes gathered on the local day of `now`, settled ones and those found since. */
export function gathererNodesToday(save: SaveData, now: number): number {
  const today = gathererDetail(save, 'gatherer', now).entry.today;
  return today?.day === localDayKey(now) ? today.nodes : 0;
}

/** Where the hero is at `now`: walking a leg, gathering at its node, or standing where it last stopped. */
export function gathererHeroAt(replay: GathererReplay, anchor: GathererAnchor | null, now: number): LatLng | null {
  const { leg } = replay;
  if (leg && now >= leg.startAt) {
    if (now >= leg.arriveAt) return leg.to;
    return interpolate(leg.from, leg.to, (now - leg.startAt) / Math.max(1, leg.arriveAt - leg.startAt));
  }
  return replay.heroAt && anchor && replay.heroAnchorAt === anchor.at ? replay.heroAt : (anchor?.position ?? null);
}

/** How far ahead the notifications look for the gatherer's next wound or full output. */
const LOOK_AHEAD_MS = 3 * 24 * 3_600_000;

/** The save with the gatherer settled to `now`, so the next replay starts from there. */
const settledTo = (save: SaveData, jobId: string, now: number): SaveData => {
  const { entry, collected } = gathererDetail(save, jobId, now);
  return { ...save, jobOutput: { ...save.jobOutput, [jobId]: entry }, collected: { ...save.collected, ...collected } };
};

/** When the worker next takes a wound, the anchor staying where it is, or null when none does. */
export function gathererFirstWoundAt(save: SaveData, jobId: string, now: number): number | null {
  if (!save.jobOutput[jobId]) return null;
  const { nodes } = gathererFinds(settledTo(save, jobId, now), jobId, now, now + LOOK_AHEAD_MS);
  return nodes.find((node) => node.wound > 0)?.at ?? null;
}

/** When the gatherer's output next reaches its node cap, the anchor staying where it is, or null. */
export function gathererFullAt(save: SaveData, jobId: string, now: number): number | null {
  if (!save.jobOutput[jobId]) return null;
  const settled = settledTo(save, jobId, now);
  const taken = settled.jobOutput[jobId].nodes ?? 0;
  if (taken >= gathererCapNodes()) return null;
  const { nodes } = gathererFinds(settled, jobId, now, now + LOOK_AHEAD_MS);
  return taken + nodes.length >= gathererCapNodes() ? nodes[nodes.length - 1].at : null;
}
