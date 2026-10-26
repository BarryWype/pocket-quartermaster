import { dungeons as allDungeons } from '@/content/dungeons';
import { dungeonModifiers, modifierById } from '@/content/modifiers';
import { rotationRules } from '@/content/rotation';

import { createRng } from '../generation/rng';
import type { DungeonDef, DungeonModifier } from '../types';
import { dungeonTags, encounterTags, mainTag } from './tags';

type Rules = typeof rotationRules;

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type TierRotation = {
  boss: string;
  short: string;
  long: string;
  modifier: { dungeonId: string; modifierId: string } | null;
};

/** The dungeons open on one rotation day, by tier. The same for every player. */
export type Rotation = { day: number; tiers: Record<number, TierRotation> };

/** Debug overrides: a dungeon forced into a `tier:slot`, or a tier's modifier forced (or cleared with null). */
export type RotationOverrides = {
  slots?: Record<string, string>;
  modifiers?: Record<number, TierRotation['modifier']>;
};

/** Days since the epoch, counted from the UTC reset hour. */
export const rotationDay = (now: number, rules: Rules = rotationRules) =>
  Math.floor((now - rules.resetHourUtc * HOUR) / DAY);

/** When the next rotation starts. */
export const nextRotationAt = (now: number, rules: Rules = rotationRules) =>
  (rotationDay(now, rules) + 1) * DAY + rules.resetHourUtc * HOUR;

const tiersOf = (dungeons: DungeonDef[]) => [...new Set(dungeons.map((d) => d.tier))].sort((a, b) => a - b);

/** Modifiers whose required tags the dungeon has. */
export function allowedModifiers(dungeon: DungeonDef, modifiers: DungeonModifier[] = dungeonModifiers) {
  const tags = dungeonTags(dungeon, { bossWeight: 3, minShare: 0, maxShown: Infinity });
  return modifiers.filter((m) => m.requires.every((tag) => tags.includes(tag)));
}

/**
 * One day's picks. Each slot favours the dungeons it hasn't had for longest,
 * never repeats yesterday's, and the long slot avoids the short one's main tag.
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

    const rng = createRng(`modifier|${day}|${tier}`);
    const options = [boss, short, long].flatMap((d) => allowedModifiers(d).map((m) => ({ dungeonId: d.id, modifierId: m.id })));
    const modifier = options.length && rng.chance(rules.modifierChance) ? rng.weighted(options, () => 1) : null;
    tiers[tier] = { boss: boss.id, short: short.id, long: long.id, modifier };
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
    Object.entries(rotation.tiers).map(([key, tier]) => {
      const n = Number(key);
      const modifier = overrides.modifiers && n in overrides.modifiers ? overrides.modifiers[n] : tier.modifier;
      return [
        n,
        {
          ...tier,
          short: overrides.slots?.[`${n}:short`] ?? tier.short,
          long: overrides.slots?.[`${n}:long`] ?? tier.long,
          modifier,
        },
      ];
    }),
  );
  return { ...rotation, tiers };
}

/** The ids open today: every tier's boss, short and long dungeons. */
export const openDungeonIds = (rotation: Rotation) =>
  Object.values(rotation.tiers).flatMap((t) => [t.short, t.long, t.boss]);

/** Today's modifier for a dungeon, if it has one. */
export function modifierFor(rotation: Rotation, dungeonId: string): DungeonModifier | null {
  const tier = Object.values(rotation.tiers).find((t) => t.modifier?.dungeonId === dungeonId);
  return tier?.modifier ? modifierById[tier.modifier.modifierId] : null;
}

/** A dungeon as a modifier changes it: encounter weights, enemy element and reward multipliers. */
export function withModifier(dungeon: DungeonDef, modifier: DungeonModifier | null | undefined): DungeonDef {
  if (!modifier) return dungeon;
  const { boost } = modifier;
  return {
    ...dungeon,
    modifierId: modifier.id,
    encounters: boost
      ? dungeon.encounters.map((e) => ((encounterTags(e)[boost.tag] ?? 0) > 0 ? { ...e, weight: e.weight * boost.multiplier } : e))
      : dungeon.encounters,
    enemyElement: modifier.enemyElement ?? dungeon.enemyElement,
    rewardMultipliers: { gold: modifier.gold ?? 1, materials: modifier.materials ?? 1 },
  };
}
