import { dungeons as allDungeons } from '@/content/dungeons';
import { rotationRules } from '@/content/rotation';

import { createRng } from '../generation/rng';
import { composeBriefing, rollSurge, withSurge, type Surge } from '../threats/compose';
import type { Briefing, DungeonDef } from '../types';
import { mainTag } from './tags';

type Rules = typeof rotationRules;

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type TierRotation = {
  boss: string;
  short: string;
  long: string;
  /** The day's surge: one open dungeon's undead, traps or beasts threat, raised a level. */
  surge: Surge | null;
};

/** The dungeons open on one rotation day, by tier. The same for every player. */
export type Rotation = {
  day: number;
  tiers: Record<number, TierRotation>;
  /** The day's composed briefing for each open dungeon (composed once, in `pickDay`). */
  composed: Record<string, Briefing>;
  /** Debug briefings forced on dungeons, keyed by dungeon id. */
  briefings?: Record<string, Briefing>;
};

/** Debug overrides: a dungeon forced into a `tier:slot`, or a briefing forced on one. */
export type RotationOverrides = {
  slots?: Record<string, string>;
  briefings?: Record<string, Briefing>;
};

/** Days since the epoch, counted from the UTC reset hour. */
export const rotationDay = (now: number, rules: Rules = rotationRules) =>
  Math.floor((now - rules.resetHourUtc * HOUR) / DAY);

/** When the next rotation starts. */
export const nextRotationAt = (now: number, rules: Rules = rotationRules) =>
  (rotationDay(now, rules) + 1) * DAY + rules.resetHourUtc * HOUR;

const tiersOf = (dungeons: DungeonDef[]) => [...new Set(dungeons.map((d) => d.tier))].sort((a, b) => a - b);

/**
 * One day's picks. Each slot favours the dungeons it hasn't had for longest,
 * never repeats yesterday's, and the long slot avoids the short one's main tag.
 * The tier's three briefings are composed here, and the surge rolled over them.
 */
function pickDay(
  day: number,
  dungeons: DungeonDef[],
  yesterday: Rotation | null,
  lastSeen: Map<string, number>,
  rules: Rules,
): Rotation {
  const tiers: Record<number, TierRotation> = {};
  let composed: Record<string, Briefing> = {};
  for (const tier of tiersOf(dungeons)) {
    const inTier = dungeons.filter((d) => d.tier === tier);
    const boss = inTier.find((d) => d.isBoss)!;
    const pick = (slot: 'short' | 'long', avoidTag: string | null) => {
      const pool = inTier.filter((d) => d.slot === slot);
      const fresh = pool.filter((d) => d.id !== yesterday?.tiers[tier]?.[slot]);
      const varied = fresh.filter((d) => !avoidTag || mainTag(d) !== avoidTag);
      const candidates = varied.length ? varied : fresh.length ? fresh : pool;
      const rng = createRng(`rotation|${day}|${tier}|${slot}`);
      return rng.weighted(candidates, (d) => (day - (lastSeen.get(d.id) ?? day - pool.length - 1)) ** 2);
    };
    const short = pick('short', null);
    const long = pick('long', mainTag(short));
    const trio = [boss, short, long];
    const briefings = Object.fromEntries(trio.map((d) => [d.id, composeBriefing(d, day)]));
    tiers[tier] = { boss: boss.id, short: short.id, long: long.id, surge: rollSurge(day, tier, briefings) };
    // The tier's overnight dungeon's briefing too, so the screens that show it
    // (Expeditions' odds keys, the Send dialog) read it instead of recomposing.
    const overnight = Object.fromEntries(inTier.filter((d) => d.overnight).map((d) => [d.id, composeBriefing(d, day)]));
    composed = { ...composed, ...briefings, ...overnight };
  }
  return { day, tiers, composed };
}

type History = { startDay: number; rotations: Rotation[]; lastSeen: Map<string, number> };

const startDayOf = (rules: Rules) => rotationDay(rules.startDay, rules);

/**
 * Advances a history until it covers `day` (inclusive). `seededYesterday` is
 * the rotation before the history's first day, for a replay that resumes from a
 * checkpoint (see `rotationFromCheckpoint`).
 */
function replayTo(kept: History, day: number, dungeons: DungeonDef[], rules: Rules, seededYesterday: Rotation | null = null): void {
  while (kept.startDay + kept.rotations.length <= day) {
    const nextDay = kept.startDay + kept.rotations.length;
    const today = pickDay(
      nextDay,
      dungeons,
      kept.rotations.at(-1) ?? (nextDay === kept.startDay ? seededYesterday : null),
      kept.lastSeen,
      rules,
    );
    for (const t of Object.values(today.tiers)) [t.short, t.long].forEach((id) => kept.lastSeen.set(id, nextDay));
    kept.rotations.push(today);
  }
}

/** The full replay, with none of the module state: the reference the cheap paths are tested against. */
export function replayRotation(day: number, dungeons: DungeonDef[] = allDungeons, rules: Rules = rotationRules): Rotation {
  const startDay = startDayOf(rules);
  if (day < startDay) return pickDay(day, dungeons, null, new Map(), rules);
  const local: History = { startDay, rotations: [], lastSeen: new Map() };
  replayTo(local, day, dungeons, rules);
  return local.rotations[day - startDay];
}

/**
 * The state a later replay can resume from: the day it resumes at, the rotation
 * it must not repeat, and every pool dungeon's last-seen day — exactly what a
 * day's picks read (the pick weight is `(day - lastSeen)^2` over the pool, and
 * a slot never repeats yesterday's dungeon, so nothing older than this
 * matters). Replays from a checkpoint give results identical to the full one.
 */
export type RotationCheckpoint = {
  /** The first day a replay from this checkpoint computes. */
  day: number;
  /** The rotation of `day - 1`; null when `day` is the start day. */
  yesterday: Rotation | null;
  /** Each pool dungeon's last-seen day, as of the start of `day`. */
  lastSeen: Record<string, number>;
};

/** A checkpoint for resuming at `day`: the full replay's state on the eve of it. */
export function checkpointOf(day: number, dungeons: DungeonDef[] = allDungeons, rules: Rules = rotationRules): RotationCheckpoint {
  const startDay = startDayOf(rules);
  if (day <= startDay) return { day: Math.max(day, startDay), yesterday: null, lastSeen: {} };
  const local: History = { startDay, rotations: [], lastSeen: new Map() };
  replayTo(local, day - 1, dungeons, rules);
  return { day, yesterday: local.rotations[day - 1 - startDay] ?? null, lastSeen: Object.fromEntries(local.lastSeen) };
}

/** The day's rotation, replayed from a checkpoint instead of the start: identical to the full replay. */
export function rotationFromCheckpoint(
  day: number,
  checkpoint: RotationCheckpoint,
  dungeons: DungeonDef[] = allDungeons,
  rules: Rules = rotationRules,
): Rotation {
  const local: History = {
    startDay: Math.max(checkpoint.day, startDayOf(rules)),
    rotations: [],
    lastSeen: new Map(Object.entries(checkpoint.lastSeen)),
  };
  replayTo(local, day, dungeons, rules, checkpoint.yesterday);
  return local.rotations[day - local.startDay];
}

/** The kept history of the app's own rotation, and the checkpoint its warm-up advances. */
const history: History = { startDay: startDayOf(rotationRules), rotations: [], lastSeen: new Map() };
let checkpoint: RotationCheckpoint | null = null;

const leadingCheckpoint = (): RotationCheckpoint => ({
  day: history.startDay + history.rotations.length,
  yesterday: history.rotations.at(-1) ?? null,
  lastSeen: Object.fromEntries(history.lastSeen),
});

/**
 * Extends the kept rotation history by up to `days` days, for the warm-up that
 * runs in slices at app start (issue 17): a screen asking for today before the
 * warm-up is done only pays the days still missing. Returns the day reached.
 */
export function warmRotationUpTo(targetDay: number, days: number): number {
  const last = history.startDay + history.rotations.length - 1;
  if (targetDay <= last) return last;
  replayTo(history, Math.min(targetDay, last + days), allDungeons, rotationRules);
  checkpoint = leadingCheckpoint();
  return history.startDay + history.rotations.length - 1;
}

/**
 * The rotation for a day. Worked out day by day from `rules.startDay` (and
 * kept), so every player gets the same one and the no-repeat rule is exact.
 * The kept history the warm-up fills makes the first call cheap; anything it
 * does not hold yet replays in full, and a checkpointed replay serves a day
 * older than what the (checkpoint-seeded) history holds.
 */
export function dailyRotation(day: number, dungeons: DungeonDef[] = allDungeons, rules: Rules = rotationRules): Rotation {
  const startDay = startDayOf(rules);
  if (day < startDay) return pickDay(day, dungeons, null, new Map(), rules);
  if (dungeons !== allDungeons || rules !== rotationRules) {
    const local: History = { startDay, rotations: [], lastSeen: new Map() };
    replayTo(local, day, dungeons, rules);
    return local.rotations[day - startDay];
  }
  const covered = history.startDay + history.rotations.length;
  if (day >= history.startDay && day < covered) return history.rotations[day - history.startDay];
  if (day >= covered) {
    replayTo(history, day, dungeons, rules);
    checkpoint = leadingCheckpoint();
    return history.rotations[day - history.startDay];
  }
  // Older than what the kept history holds (it starts at a checkpoint):
  // a checkpointed replay is exact and costs only the days it adds.
  if (checkpoint && day >= checkpoint.day) return rotationFromCheckpoint(day, checkpoint, dungeons, rules);
  return replayRotation(day, dungeons, rules);
}

export function applyOverrides(rotation: Rotation, overrides: RotationOverrides = {}): Rotation {
  const tiers = Object.fromEntries(
    Object.entries(rotation.tiers).map(([key, tier]) => [
      Number(key),
      {
        ...tier,
        short: overrides.slots?.[`${key}:short`] ?? tier.short,
        long: overrides.slots?.[`${key}:long`] ?? tier.long,
      },
    ]),
  );
  return {
    ...rotation,
    tiers,
    ...(overrides.briefings && Object.keys(overrides.briefings).length > 0 ? { briefings: overrides.briefings } : {}),
  };
}

/** The ids open today: every tier's boss, short and long dungeons. */
export const openDungeonIds = (rotation: Rotation) =>
  Object.values(rotation.tiers).flatMap((t) => [t.short, t.long, t.boss]);

/**
 * A dungeon's briefing today: a debug-forced one when there is one, else the
 * day's composed briefing (composed once in `pickDay`, carried on the
 * rotation) with the tier's surge applied when it targets the dungeon. Same
 * day, same briefing for everyone. A rotation without a composed briefing
 * for the dungeon (not one of its open ones, or a hand-built rotation)
 * composes it on the spot.
 */
export function briefingFor(rotation: Rotation, dungeon: DungeonDef): Briefing {
  const forced = rotation.briefings?.[dungeon.id];
  if (forced) return forced;
  const surge = Object.values(rotation.tiers).find((t) => t.surge?.dungeonId === dungeon.id)?.surge ?? null;
  const briefing = rotation.composed?.[dungeon.id] ?? composeBriefing(dungeon, rotation.day);
  return surge ? withSurge(briefing, surge.threatId) : briefing;
}
