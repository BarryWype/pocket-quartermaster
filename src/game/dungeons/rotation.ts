import { dungeons as allDungeons } from '@/content/dungeons';
import { rotationRules } from '@/content/rotation';

import { composeBriefing, composeThreats, rollSurge, surgeRolled, withSurge, type Surge } from '../threats/compose';
import type { ActiveThreat, Briefing, DungeonDef, ThreatId } from '../types';
import { tierChain } from './unlock';

type Rules = typeof rotationRules;

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** How many salted seeds a dungeon's daily threats are re-rolled over when yesterday's repeat. */
const SALTS = 8;

export type TierRotation = {
  /** The tier's chain briefings for the day, keyed by dungeon id, the surge applied. */
  briefings: Record<string, Briefing>;
  /** The day's surge: one chain dungeon's undead, traps or beasts threat, raised a level. */
  surge: Surge | null;
};

/** The day's briefings, by tier. The same for every player. */
export type Rotation = {
  day: number;
  tiers: Record<number, TierRotation>;
  /** Debug briefings forced on dungeons, keyed by dungeon id. */
  briefings?: Record<string, Briefing>;
};

/** Debug overrides: a briefing forced on a dungeon. */
export type RotationOverrides = {
  briefings?: Record<string, Briefing>;
};

/** Days since the epoch, counted from the UTC reset hour. */
export const rotationDay = (now: number, rules: Rules = rotationRules) =>
  Math.floor((now - rules.resetHourUtc * HOUR) / DAY);

/** When the next rotation starts. */
export const nextRotationAt = (now: number, rules: Rules = rotationRules) =>
  (rotationDay(now, rules) + 1) * DAY + rules.resetHourUtc * HOUR;

/**
 * What the replay keeps per day: only each dungeon's salt and threats, never
 * the full briefings (the restriction roll is the expensive part).
 */
type DayTiers = Record<number, { salts: Record<string, number>; threats: Record<string, ActiveThreat[]>; surge: Surge | null }>;
type DayRecord = { day: number; tiers: DayTiers };

/** Whether two threat sets are the same ones at the same levels. */
const sameThreats = (a: ActiveThreat[], b: ActiveThreat[]) =>
  a.length === b.length && a.every((t, i) => t.id === b[i].id && t.level === b[i].level);

/** The briefing's lead threat: the highest level, the first drawn on a tie. */
const mainThreatOf = (threats: ActiveThreat[]) =>
  threats.length ? threats.reduce((main, t) => (t.level > main.level ? t : main), threats[0]) : null;

/**
 * One day's salts. Each chain dungeon walks its salted seeds and takes the
 * first whose threats differ from yesterday's without reusing a main threat
 * an earlier dungeon of the tier already shows today; failing that, the first
 * that merely differs; failing that, salt 0.
 */
function pickDay(day: number, dungeons: DungeonDef[], yesterday: DayTiers | null): DayTiers {
  const tiers: DayTiers = {};
  for (const tier of [...new Set(dungeons.map((d) => d.tier))].sort((a, b) => a - b)) {
    const salts: Record<string, number> = {};
    const threats: Record<string, ActiveThreat[]> = {};
    const usedMain = new Set<ThreatId>();
    for (const dungeon of tierChain(tier, dungeons)) {
      const yesterdayThreats = yesterday?.[tier]?.threats[dungeon.id] ?? null;
      let chosen: { salt: number; threats: ActiveThreat[] } | null = null;
      let firstDiff: { salt: number; threats: ActiveThreat[] } | null = null;
      for (let s = 0; s < SALTS; s++) {
        const threatsAt = composeThreats(dungeon, day, s);
        const differs = !yesterdayThreats || !sameThreats(threatsAt, yesterdayThreats);
        if (differs && !firstDiff) firstDiff = { salt: s, threats: threatsAt };
        const main = mainThreatOf(threatsAt);
        if (differs && main !== null && !usedMain.has(main.id)) {
          chosen = { salt: s, threats: threatsAt };
          break;
        }
      }
      const picked = chosen ?? firstDiff ?? { salt: 0, threats: composeThreats(dungeon, day, 0) };
      const main = mainThreatOf(picked.threats);
      if (main) usedMain.add(main.id);
      salts[dungeon.id] = picked.salt;
      threats[dungeon.id] = picked.threats;
    }
    const surge = surgeRolled(day, tier) ? rollSurge(day, tier, threats) : null;
    tiers[tier] = { salts, threats, surge };
  }
  return tiers;
}

/** The public rotation of a replayed day: full briefings, composed with the day's salts, the surge applied. */
function buildRotation(record: DayRecord, dungeons: DungeonDef[]): Rotation {
  const tiers: Record<number, TierRotation> = {};
  for (const [key, { salts, surge }] of Object.entries(record.tiers)) {
    const briefings: Record<string, Briefing> = {};
    for (const [id, salt] of Object.entries(salts)) {
      const dungeon = dungeons.find((d) => d.id === id)!;
      briefings[id] = composeBriefing(dungeon, record.day, salt);
    }
    if (surge) briefings[surge.dungeonId] = withSurge(briefings[surge.dungeonId], surge.threatId);
    tiers[Number(key)] = { briefings, surge };
  }
  return { day: record.day, tiers };
}

const history: DayRecord[] = [];
/** The last day built into full briefings; building them is the expensive part. */
let built: { day: number; rotation: Rotation } | null = null;

/**
 * The rotation for a day. The salts are worked out day by day from
 * `rules.startDay` (and kept), so every player gets the same one and the
 * differs-from-yesterday rule is exact. The full briefings are composed only
 * for the day asked for.
 */
export function dailyRotation(day: number, dungeons: DungeonDef[] = allDungeons, rules: Rules = rotationRules): Rotation {
  const startDay = rotationDay(rules.startDay, rules);
  if (day < startDay) return buildRotation({ day, tiers: pickDay(day, dungeons, null) }, dungeons);
  const kept = dungeons === allDungeons && rules === rotationRules ? history : [];
  while (startDay + kept.length <= day) {
    kept.push({
      day: startDay + kept.length,
      tiers: pickDay(startDay + kept.length, dungeons, kept.at(-1)?.tiers ?? null),
    });
  }
  const record = kept[day - startDay];
  if (kept === history && built?.day === day) return built.rotation;
  const rotation = buildRotation(record, dungeons);
  if (kept === history) built = { day, rotation };
  return rotation;
}

export function applyOverrides(rotation: Rotation, overrides: RotationOverrides = {}): Rotation {
  return {
    ...rotation,
    ...(overrides.briefings && Object.keys(overrides.briefings).length > 0 ? { briefings: overrides.briefings } : {}),
  };
}

/**
 * A dungeon's briefing today: a debug-forced one when there is one, else the
 * day's composed briefing (with the tier's surge applied when it targets the
 * dungeon). Dungeons outside the rotation — overnight and secret ones — keep
 * their own composed briefing. Same day, same briefing for everyone.
 */
export function briefingFor(rotation: Rotation, dungeon: DungeonDef): Briefing {
  return rotation.briefings?.[dungeon.id] ?? rotation.tiers[dungeon.tier]?.briefings[dungeon.id] ?? composeBriefing(dungeon, rotation.day);
}
