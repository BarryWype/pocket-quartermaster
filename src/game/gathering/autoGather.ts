import { gatheringConfig, type GatheringConfig } from '@/content/gatheringConfig';
import { spawnConfig as defaultSpawnConfig } from '@/content/spawnConfig';
import { walkableRules } from '@/content/walkable';

import { spawnPositionAt } from '../generation/animalPaths';
import { distanceMeters, interpolate } from '../generation/geo';
import { generateTileSpawns } from '../generation/spawns';
import { tilesAround } from '../generation/tiles';
import { windowIndex } from '../generation/time';
import type { LatLng, ResourceKind, Spawn, SpawnConfig } from '../generation/types';
import { mapTileKeysFor, placeSpawns, type WalkableTile } from '../generation/walkable';
import { addMaterials } from '../inventory';
import { recordSteps } from '../rewards/chests';
import { lureSpawns } from '../rewards/lures';
import type { SaveData } from '../save';
import { TUTORIAL_SPAWN_ID } from '../tutorial/tutorial';
import type { PatrolKind, TravellerKind } from '../patrols/generate';
import type { TravellerReward } from '../patrols/travellers';
import type { MaterialStack } from '../types';
import { collectSpawn, localDayKey } from './gathering';

/** One location reading recorded while auto-gather runs. */
export type WalkFix = {
  position: LatLng;
  /** Metres, null when unknown. */
  accuracy: number | null;
  timestamp: number;
  /**
   * The app's pedometer was counting these steps: the app was open, or still
   * running with its step watch (Android credits background steps on return).
   */
  stepsCounted: boolean;
};

export type IgnoreReason = 'accuracy' | 'speed' | 'jump' | 'gap' | 'stale';

export type WalkSummary = {
  startedAt: number;
  endedAt: number;
  distanceMeters: number;
  nodes: number;
  gained: MaterialStack[];
  steps: number;
  /** Steps worked out from the distance, where the pedometer couldn't count. */
  stepsEstimated: boolean;
  /** Fixes and segments left out, by reason. */
  ignored: Partial<Record<IgnoreReason, number>>;
  /** Tracking stopped by itself after a while without movement. */
  autoStopped: boolean;
  /** Patrols and travellers met while walking (the background task fills this in). */
  patrols?: WalkPatrols;
};

/** A patrol fight met on a walk, by the player or the escort. */
export type WalkFight = { kind: PatrolKind; tier: number; elite: boolean; by: 'you' | 'escort'; won: boolean };

/** Patrols and travellers met on a walk, for the "While you walked" card. */
export type WalkPatrols = {
  fights: WalkFight[];
  escortHp: { heroId: string; before: number; after: number; max: number } | null;
  travellers: { kind: TravellerKind; reward: TravellerReward['kind'] }[];
  gold: number;
  /** XP per hero, added up. */
  xp: number;
  materials: MaterialStack[];
};

/** A summary kept in the history; the "While you walked" card shows the newest unseen one. */
export type WalkRecord = WalkSummary & { seen: boolean };

export type AutoGatherSave = {
  /** Fixes at or before this time were processed already. */
  processedUntil: number;
  /** The last fix of the processed path, so the next batch joins up with it. */
  anchor: WalkFix | null;
  /** Newest first. */
  history: WalkRecord[];
};

type AutoConfig = GatheringConfig['autoGather'];

export type WalkOptions = {
  config?: GatheringConfig;
  spawnConfig?: SpawnConfig;
  /** Map tiles to place spawns on (see walkable.ts); without them spawns keep their generated positions. */
  tiles?: Record<string, WalkableTile | null>;
  /** Where spawns come from; defaults to the world's generated spawns plus the active lure's. */
  spawnsAt?: (point: LatLng, timeMs: number) => Spawn[];
  /** Estimate steps from distance where the pedometer wasn't counting (Android). */
  estimateSteps?: boolean;
  /** Steps the pedometer measured over the walk, when it keeps history (iOS). */
  measuredSteps?: number | null;
  autoStopped?: boolean;
};

type Segment = { from: WalkFix; to: WalkFix; meters: number };

/**
 * The path to process: fixes after `processedUntil`, in time order, joined
 * into segments. Inaccurate fixes are dropped; a segment that is too fast,
 * too long or too far apart in time is skipped and the path restarts from
 * its end, so a bus ride or a GPS jump is left out without losing the rest.
 */
export function walkSegments(state: AutoGatherSave, fixes: WalkFix[], config: AutoConfig = gatheringConfig.autoGather) {
  const ignored: Partial<Record<IgnoreReason, number>> = {};
  const ignore = (reason: IgnoreReason) => (ignored[reason] = (ignored[reason] ?? 0) + 1);
  const segments: Segment[] = [];
  let anchor = state.anchor;
  let last = state.processedUntil;

  for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
    if (fix.timestamp <= last) {
      ignore('stale');
      continue;
    }
    last = fix.timestamp;
    if (fix.accuracy !== null && fix.accuracy > config.maxAccuracyMeters) {
      ignore('accuracy');
      continue;
    }
    if (anchor) {
      const meters = distanceMeters(anchor.position, fix.position);
      const seconds = (fix.timestamp - anchor.timestamp) / 1000;
      if (seconds > config.maxSegmentSeconds) ignore('gap');
      else if (meters > config.maxSegmentMeters) ignore('jump');
      else if (meters / seconds > config.maxSpeed) ignore('speed');
      else segments.push({ from: anchor, to: fix, meters });
    }
    anchor = fix;
  }
  return { segments, ignored, anchor, processedUntil: last };
}

const KINDS: ResourceKind[] = ['wood', 'ore', 'animal', 'herb'];

/**
 * The world's spawns around a point at a moment, plus the active lure's,
 * generated once per tile and window.
 */
function generatedSpawns(save: SaveData, config: SpawnConfig) {
  const cache = new Map<string, Spawn[]>();
  return (point: LatLng, timeMs: number): Spawn[] => {
    const world = KINDS.flatMap((kind) => {
      const { precision, windowMinutes } = config.kinds[kind];
      const window = windowIndex(timeMs, windowMinutes);
      return tilesAround(point, precision).flatMap((tile) => {
        const key = `${kind}|${tile}|${window}`;
        if (!cache.has(key)) cache.set(key, generateTileSpawns(kind, tile, window, { config }));
        return cache.get(key)!;
      });
    });
    const lure = save.activeLure && save.activeLure.activatedAt <= timeMs ? lureSpawns(save.activeLure, timeMs) : [];
    return [...world, ...lure];
  };
}

/** When a spawn appeared: its window's start, or when the lure that drew it was used. */
function startsAt(spawn: Spawn, save: SaveData, config: SpawnConfig) {
  if (save.activeLure && spawn.tile === save.activeLure.id) return save.activeLure.activatedAt;
  return spawn.expiresAt - config.kinds[spawn.kind].windowMinutes * 60_000;
}

/** Each segment cut into pieces of at most `sampleMeters`, with the time at each end. */
function pieces(segments: Segment[], config: AutoConfig) {
  return segments.flatMap(({ from, to, meters }) => {
    const count = Math.max(1, Math.ceil(meters / config.sampleMeters));
    const at = (i: number) => ({
      position: interpolate(from.position, to.position, i / count),
      timestamp: from.timestamp + ((to.timestamp - from.timestamp) * i) / count,
    });
    return Array.from({ length: count }, (_, i) => ({ from: at(i), to: at(i + 1), meters: meters / count }));
  });
}

type Piece = ReturnType<typeof pieces>[number];

/** Metres east and north of `origin` (flat-earth, fine over a few hundred metres). */
function toLocal(origin: LatLng, point: LatLng) {
  const north = distanceMeters(origin, { latitude: point.latitude, longitude: origin.longitude }) * Math.sign(point.latitude - origin.latitude);
  const east = distanceMeters(origin, { latitude: origin.latitude, longitude: point.longitude }) * Math.sign(point.longitude - origin.longitude);
  return { east, north };
}

/** Share of the way along a piece (0–1) that comes closest to a fixed point. */
function closestShare(piece: Piece, point: LatLng) {
  const end = toLocal(piece.from.position, piece.to.position);
  const target = toLocal(piece.from.position, point);
  const lengthSquared = end.east ** 2 + end.north ** 2;
  if (lengthSquared === 0) return 0;
  return Math.min(1, Math.max(0, (target.east * end.east + target.north * end.north) / lengthSquared));
}

/** Where along a piece the walker comes closest to a spawn (animals move, so they are checked step by step). */
function closestApproach(piece: Piece, spawn: Spawn, config: AutoConfig) {
  const walkerAt = (share: number) => ({
    position: interpolate(piece.from.position, piece.to.position, share),
    timestamp: piece.from.timestamp + (piece.to.timestamp - piece.from.timestamp) * share,
  });
  if (spawn.kind !== 'animal') return walkerAt(closestShare(piece, spawn.position));
  const steps = Math.max(1, Math.ceil(piece.meters / config.animalStepMeters));
  let best = walkerAt(0);
  let bestDistance = Infinity;
  for (let i = 0; i <= steps; i++) {
    const walker = walkerAt(i / steps);
    const distance = distanceMeters(walker.position, spawnPositionAt(spawn, walker.timestamp));
    if (distance < bestDistance) {
      best = walker;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The generated spawns around a piece that could end up within the auto
 * radius once placed (placement moves a node up to `maxSnapMeters`; animals
 * roam their tile, so they are all kept).
 */
function rawCandidates(save: SaveData, options: WalkOptions) {
  const source = options.spawnsAt ?? generatedSpawns(save, options.spawnConfig ?? defaultSpawnConfig);
  const reach = (options.config ?? gatheringConfig).autoGather.radiusMeters + walkableRules.maxSnapMeters;
  return (piece: Piece) => {
    const around = new Map<string, Spawn>();
    for (const end of [piece.from, piece.to]) {
      for (const spawn of source(end.position, end.timestamp)) around.set(spawn.id, spawn);
    }
    return [...around.values()].filter((spawn) => {
      if (spawn.kind === 'animal') return true;
      const share = closestShare(piece, spawn.position);
      return distanceMeters(interpolate(piece.from.position, piece.to.position, share), spawn.position) <= reach;
    });
  };
}

/** The map tiles needed to place the spawns along a walk, so they can be loaded before processing it. */
export function walkTileKeys(save: SaveData, fixes: WalkFix[], options: Omit<WalkOptions, 'tiles'> = {}): string[] {
  const config = (options.config ?? gatheringConfig).autoGather;
  const candidates = rawCandidates(save, options);
  const keys = new Set<string>();
  for (const piece of pieces(walkSegments(save.autoGather, fixes, config).segments, config)) {
    for (const key of mapTileKeysFor(candidates(piece))) keys.add(key);
  }
  return [...keys];
}

/**
 * Collects the regular nodes a walk passed within the auto radius, in path
 * order, exactly as tapping them there and then would have: same yield,
 * pickaxe rules, depletion and walking bonus. Which nodes existed comes from
 * each fix's time, so a walk processed hours later gives the same result.
 * Fixes already processed are skipped, so a batch can't gather twice.
 */
export function processWalkPath(
  save: SaveData,
  fixes: WalkFix[],
  options: WalkOptions = {},
): { save: SaveData; summary: WalkSummary } {
  const config = options.config ?? gatheringConfig;
  const auto = config.autoGather;
  const spawns = options.spawnConfig ?? defaultSpawnConfig;
  const { segments, ignored, anchor, processedUntil } = walkSegments(save.autoGather, fixes, auto);
  const candidates = rawCandidates(save, options);
  // Placed on walkable places like the map's, once per spawn; without tiles they stay where generated.
  const placed = new Map<string, Spawn | null>();
  const place = (spawn: Spawn) => {
    if (!options.tiles) return spawn;
    if (!placed.has(spawn.id)) placed.set(spawn.id, placeSpawns([spawn], options.tiles)[0] ?? null);
    return placed.get(spawn.id) ?? null;
  };
  const collectConfig = { ...config, collectRadiusMeters: auto.radiusMeters };

  let next = save;
  let gained: Record<string, number> = {};
  let nodes = 0;
  for (const piece of pieces(segments, auto)) {
    const speed = piece.to.timestamp > piece.from.timestamp ? piece.meters / ((piece.to.timestamp - piece.from.timestamp) / 1000) : 0;
    const hits = candidates(piece)
      .filter((spawn) => spawn.id !== TUTORIAL_SPAWN_ID && !(spawn.id in next.collected))
      .flatMap((spawn) => place(spawn) ?? [])
      .map((spawn) => ({ spawn, at: closestApproach(piece, spawn, auto) }))
      .filter(({ spawn, at }) => startsAt(spawn, next, spawns) <= at.timestamp && at.timestamp < spawn.expiresAt)
      .sort((a, b) => a.at.timestamp - b.at.timestamp);
    for (const { spawn, at } of hits) {
      const result = collectSpawn(next, spawn, { position: at.position, speed }, at.timestamp, { config: collectConfig });
      if (!result.ok) continue;
      next = result.save;
      gained = addMaterials(gained, result.gained);
      nodes++;
    }
  }

  // Steps: the pedometer's where it counted, otherwise estimated from the distance.
  const estimatedByDay: Record<string, number> = {};
  if (options.estimateSteps) {
    for (const { from, to, meters } of segments) {
      if (from.stepsCounted || to.stepsCounted) continue;
      const day = localDayKey(to.timestamp);
      estimatedByDay[day] = (estimatedByDay[day] ?? 0) + meters / auto.strideMeters;
    }
  }
  for (const [day, steps] of Object.entries(estimatedByDay)) next = recordSteps(next, day, Math.round(steps));
  const estimated = Object.values(estimatedByDay).reduce((sum, steps) => sum + Math.round(steps), 0);
  const measured = options.measuredSteps ?? null;

  const summary: WalkSummary = {
    startedAt: segments[0]?.from.timestamp ?? 0,
    endedAt: segments[segments.length - 1]?.to.timestamp ?? 0,
    distanceMeters: Math.round(segments.reduce((sum, s) => sum + s.meters, 0)),
    nodes,
    gained: Object.entries(gained).map(([materialId, amount]) => ({ materialId, amount })),
    steps: measured ?? estimated,
    stepsEstimated: measured === null && estimated > 0,
    ignored,
    autoStopped: options.autoStopped ?? false,
  };
  return { save: { ...next, autoGather: { ...next.autoGather, processedUntil, anchor } }, summary };
}

/** Adds a summary to the history (newest first, capped), unless the walk went nowhere. */
export function recordWalk(save: SaveData, summary: WalkSummary, config: AutoConfig = gatheringConfig.autoGather): SaveData {
  if (summary.distanceMeters === 0 && !summary.autoStopped) return save;
  const history = [{ ...summary, seen: false }, ...save.autoGather.history].slice(0, config.historySize);
  return { ...save, autoGather: { ...save.autoGather, history } };
}

/** The walk to show in the "While you walked" card: the newest unseen one that gathered something or met patrols. */
export function walkToShow(save: SaveData): WalkRecord | null {
  const latest = save.autoGather.history[0];
  return latest && !latest.seen && (latest.nodes > 0 || !!latest.patrols?.fights.length) ? latest : null;
}

export function markWalksSeen(save: SaveData): SaveData {
  return { ...save, autoGather: { ...save.autoGather, history: save.autoGather.history.map((w) => ({ ...w, seen: true })) } };
}

// The background buffer: the task only appends to it; the app processes and clears it.

export type WalkBuffer = {
  fixes: WalkFix[];
  /** When tracking started or the player last moved, for auto-stop. */
  lastMovedAt: number;
  /** Set when tracking stopped by itself after a while without movement. */
  autoStopped: boolean;
  /** The last accurate fix, kept when processed fixes are cleared: movement is measured from it. */
  reference: WalkFix | null;
};

export const emptyBuffer = (now: number): WalkBuffer => ({ fixes: [], lastMovedAt: now, autoStopped: false, reference: null });

/**
 * Appends new fixes. A fix within `minMoveMeters` of the last accurate one is
 * not stored, so standing still doesn't fill the buffer; inaccurate fixes are
 * kept (processing reports them) but don't count as movement, so GPS drift
 * indoors doesn't hold off auto-stop. The buffer drops fixes older than
 * `bufferHours` and keeps the newest `bufferMaxFixes`.
 */
export function appendFixes(buffer: WalkBuffer, fixes: WalkFix[], now: number, config: AutoConfig = gatheringConfig.autoGather): WalkBuffer {
  const accurate = (fix: WalkFix) => fix.accuracy === null || fix.accuracy <= config.maxAccuracyMeters;
  const kept = [...buffer.fixes];
  let { lastMovedAt } = buffer;
  // Buffers saved before `reference` existed fall back to their last accurate fix.
  let reference = buffer.reference ?? kept.findLast(accurate) ?? null;
  for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
    const latest = Math.max(kept[kept.length - 1]?.timestamp ?? 0, reference?.timestamp ?? 0);
    if (fix.timestamp <= latest) continue;
    if (reference && distanceMeters(reference.position, fix.position) < config.minMoveMeters) continue;
    kept.push(fix);
    if (!accurate(fix)) continue;
    reference = fix;
    lastMovedAt = Math.max(lastMovedAt, fix.timestamp);
  }
  const oldest = now - config.bufferHours * 3_600_000;
  return { ...buffer, lastMovedAt, reference, fixes: kept.filter((f) => f.timestamp >= oldest).slice(-config.bufferMaxFixes) };
}

/** Drops the fixes a processing run went through. */
export function clearProcessed<T extends WalkBuffer>(buffer: T, processedUntil: number): T {
  return { ...buffer, fixes: buffer.fixes.filter((f) => f.timestamp > processedUntil) };
}

export function shouldAutoStop(buffer: WalkBuffer, now: number, minutes: number) {
  return now - buffer.lastMovedAt >= minutes * 60_000;
}

/** A loop of fixes around `center` at walking pace, ending at `endAt`, for testing without walking. */
export function playbackRoute(
  center: LatLng,
  endAt: number,
  { minutes = 30, speed = 1.4, everyMeters = 12, stepsCounted = false }: { minutes?: number; speed?: number; everyMeters?: number; stepsCounted?: boolean } = {},
): WalkFix[] {
  const total = minutes * 60 * speed;
  const radius = total / (2 * Math.PI);
  const count = Math.ceil(total / everyMeters);
  const metresPerDegree = 111_320;
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    const north = radius * Math.sin(angle);
    const east = radius * (Math.cos(angle) - 1);
    return {
      position: {
        latitude: center.latitude + north / metresPerDegree,
        longitude: center.longitude + east / (metresPerDegree * Math.cos((center.latitude * Math.PI) / 180)),
      },
      accuracy: 8,
      timestamp: Math.round(endAt - ((count - i) * everyMeters * 1000) / speed),
      stepsCounted,
    };
  });
}
