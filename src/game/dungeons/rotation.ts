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
    const briefings = Object.fromEntries([boss, short, long].map((d) => [d.id, composeBriefing(d, day)]));
    tiers[tier] = { boss: boss.id, short: short.id, long: long.id, surge: rollSurge(day, tier, briefings) };
  }
  return { day, tiers };
}

type History = { rotations: Rotation[]; lastSeen: Map<string, number> };
const history: History = { rotations: [], lastSeen: new Map() };

/**
 * The rotation for a day. Worked out day by day from `rules.startDay` (and
 * kept), so every player gets the same one and the no-repeat rule is exact.
 */
export function dailyRotation(day: number, dungeons: DungeonDef[] = allDungeons, rules: Rules = rotationRules): Rotation {
  const startDay = rotationDay(rules.startDay, rules);
  if (day < startDay) return pickDay(day, dungeons, null, new Map(), rules);
  const kept: History = dungeons === allDungeons && rules === rotationRules ? history : { rotations: [], lastSeen: new Map() };
  while (startDay + kept.rotations.length <= day) {
    const today = pickDay(startDay + kept.rotations.length, dungeons, kept.rotations.at(-1) ?? null, kept.lastSeen, rules);
    for (const t of Object.values(today.tiers)) [t.short, t.long].forEach((id) => kept.lastSeen.set(id, today.day));
    kept.rotations.push(today);
  }
  return kept.rotations[day - startDay];
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
 * day's composed briefing with the tier's surge applied when it targets the
 * dungeon. Same day, same briefing for everyone.
 */
export function briefingFor(rotation: Rotation, dungeon: DungeonDef): Briefing {
  const forced = rotation.briefings?.[dungeon.id];
  if (forced) return forced;
  const surge = Object.values(rotation.tiers).find((t) => t.surge?.dungeonId === dungeon.id)?.surge ?? null;
  const briefing = composeBriefing(dungeon, rotation.day);
  return surge ? withSurge(briefing, surge.threatId) : briefing;
}
