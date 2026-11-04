import { gathererRules, jobById } from '@/content/jobs';
import { resources } from '@/content/resources';
import { spawnConfig } from '@/content/spawnConfig';

import { spawnPositionAt } from '../generation/animalPaths';
import { distanceMeters } from '../generation/geo';
import { createRng } from '../generation/rng';
import { generateTileSpawns } from '../generation/spawns';
import { tilesWithin } from '../generation/tiles';
import { windowRange } from '../generation/time';
import type { LatLng, ResourceKind, Spawn } from '../generation/types';
import { canGather, spawnYield } from '../gathering/gathering';
import { readSpawn } from '../gathering/lockedNodes';
import { isRevealed } from '../reveal/reveal';
import type { JobOutput, SaveData } from '../save';
import { maxHp } from '../team/health';
import type { HeroState, MaterialStack } from '../types';
import { cycleAt, cycleOf, jobWorker, timeOf } from './jobs';

/** A full gatherer output holds this many gathered nodes. */
export const gathererCapNodes = () => Math.floor((gathererRules.capHours * 60) / gathererRules.minutesPerNode);

/** One node the gatherer took: when, what the camp gained, and the HP it cost the worker (0 when none). */
export type FoundNode = { spawn: Spawn; at: number; gained: MaterialStack[]; wound: number };

export type GathererWound = { at: number; heroId: string; hp: number };

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

/** The gatherer's worker and camp, when one works the job. */
const campOf = (save: SaveData, jobId: string): { worker: HeroState; camp: { position: LatLng; since: number } } | null => {
  const worker = jobWorker(save, jobId);
  const camp = worker?.job?.camp;
  return worker && camp ? { worker, camp } : null;
};

/**
 * The nodes the gatherer takes, among those whose window ended in (from, to]:
 * world spawns around the camp that nobody collected by their end. Taken in
 * order of window end, each at the first working moment inside its window
 * that is one node's worth of working time after the previous one. Scans at most one cap's worth of working
 * time past `from`, and stop when the output's node count reaches the cap.
 */
export function gathererFinds(save: SaveData, jobId: string, from: number, to: number): { nodes: FoundNode[] } {
  const spot = campOf(save, jobId);
  const entry = save.jobOutput[jobId];
  if (!spot || jobById[jobId]?.kind !== 'outdoor') return { nodes: [] };
  const cap = gathererCapNodes();
  let taken = entry?.nodes ?? 0;
  if (taken >= cap || from >= to) return { nodes: [] };
  const { worker, camp } = spot;
  // One cap's worth of working time, plus the longest window for nodes picked in it: a save left for days looks no further.
  const longest = Math.max(...Object.values(spawnConfig.kinds).map((kind) => kind.windowMinutes)) * 60_000;
  const end = Math.min(to, workEndsAt(worker, from, gathererRules.capHours) + longest);
  const start = Math.max(from, camp.since);
  if (end <= start) return { nodes: [] };

  const spawns: Spawn[] = [];
  for (const kind of Object.keys(spawnConfig.kinds) as ResourceKind[]) {
    if (!isRevealed(save, kind === 'animal' ? 'animals' : 'resources')) continue;
    const { precision, windowMinutes } = spawnConfig.kinds[kind];
    const tiles = tilesWithin(camp.position, gathererRules.radiusMeters, precision);
    const length = windowMinutes * 60_000;
    for (let index = Math.floor(from / length); index * length < end; index++) {
      if (windowRange(index, windowMinutes).end <= from) continue;
      for (const tile of tiles) spawns.push(...generateTileSpawns(kind, tile, index));
    }
  }

  const candidates = spawns.filter((spawn) => {
    if (spawn.expiresAt <= start || spawn.expiresAt > end) return false;
    const position = spawnPositionAt(spawn, spawn.expiresAt - 1);
    if (distanceMeters(camp.position, position) > gathererRules.radiusMeters) return false;
    if (spawn.id in save.collected) return false;
    return canGather(save, spawn);
  });
  candidates.sort((a, b) => a.expiresAt - b.expiresAt || (a.id < b.id ? -1 : 1));

  const paceHours = gathererRules.minutesPerNode / 60;
  const { d, c } = cycleOf(worker);
  let clock = entry?.lastNodeAt ?? camp.since;
  const nodes: FoundNode[] = [];
  /** The first working moment, one node's worth of working time after the clock, once the node is out. */
  const pickAt = (opens: number) => {
    let at = Math.max(workEndsAt(worker, clock, paceHours), opens);
    const x = cycleAt(worker, at);
    if (mod(x, c) >= d) at = timeOf(worker, x + c - mod(x, c));
    return at;
  };
  for (const spawn of candidates) {
    if (taken >= cap) break;
    const opens = Math.max(spawn.expiresAt - spawnConfig.kinds[spawn.kind].windowMinutes * 60_000, camp.since);
    const at = pickAt(opens);
    // Too late for this one: it expired before the worker got to it.
    if (at >= spawn.expiresAt) continue;
    clock = at;
    taken++;
    nodes.push({
      spawn,
      at,
      gained: spawnYield(spawn, resources, readSpawn(save, spawn).resourceId),
      wound: createRng(`gatherer|wound|${spawn.id}|${worker.id}`).chance(gathererRules.woundChancePerNode)
        ? gathererRules.woundHpShare * maxHp(save, worker)
        : 0,
    });
  }
  return { nodes };
}

/** The gatherer's node count now: the settled ones plus those found since, capped at the cap. */
export function gathererNodesNow(save: SaveData, jobId: string, now: number): number {
  const entry = save.jobOutput[jobId];
  const spot = campOf(save, jobId);
  if (!entry || !spot) return entry?.nodes ?? 0;
  return (entry.nodes ?? 0) + gathererFinds(save, jobId, Math.max(entry.since, spot.camp.since), now).nodes.length;
}

/** The gatherer's output entry settled to `now`, plus just the fresh wounds, for settling the hero's HP. */
export function gathererDetail(
  save: SaveData,
  jobId: string,
  now: number,
): { entry: JobOutput; wounds: GathererWound[] } {
  const entry = save.jobOutput[jobId];
  const spot = campOf(save, jobId);
  if (!entry) return { entry: { amounts: {}, fraction: 0, units: 0, since: now }, wounds: [] };
  if (!spot) return { entry: { ...entry, since: now }, wounds: [] };
  const finds = gathererFinds(save, jobId, Math.max(entry.since, spot.camp.since), now);
  const amounts = { ...entry.amounts };
  for (const node of finds.nodes) {
    for (const gained of node.gained) amounts[gained.materialId] = (amounts[gained.materialId] ?? 0) + gained.amount;
  }
  const wounds = finds.nodes
    .filter((node) => node.wound > 0)
    .map((node): GathererWound => ({ at: node.at, heroId: spot.worker.id, hp: node.wound }));
  return {
    entry: {
      ...entry,
      amounts,
      fraction: 0,
      units: entry.units + finds.nodes.length,
      nodes: (entry.nodes ?? 0) + finds.nodes.length,
      ...(finds.nodes.length > 0 ? { lastNodeAt: finds.nodes[finds.nodes.length - 1].at } : {}),
      wounds: [...(entry.wounds ?? []), ...wounds],
      since: now,
    },
    wounds,
  };
}

/** When the gatherer's output next reaches its node cap, or null when no node gets it there. */
export function gathererFullAt(save: SaveData, jobId: string, now: number): number | null {
  if (!save.jobOutput[jobId]) return null;
  // Settled to now first, so the node count and pace clock include what was found since the last settle.
  const settled = { ...save, jobOutput: { ...save.jobOutput, [jobId]: gathererDetail(save, jobId, now).entry } };
  const taken = settled.jobOutput[jobId].nodes ?? 0;
  if (taken >= gathererCapNodes()) return null;
  const finds = gathererFinds(settled, jobId, now, now + gathererRules.capHours * 24 * 3_600_000);
  if (finds.nodes.length === 0 || taken + finds.nodes.length < gathererCapNodes()) return null;
  // A node counts once its window has ended, when it is known the player left it.
  return finds.nodes[finds.nodes.length - 1].spawn.expiresAt;
}
