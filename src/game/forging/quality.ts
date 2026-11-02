import { masteryRules, QUALITIES, qualities, rollRules } from '@/content/forging';
import { itemById, relicById } from '@/content/lookup';

import { relicStats } from '../equipment/budget';
import type { Rng } from '../generation/rng';
import type { GearDef, GearInstance, Quality, StatKey, Stats } from '../types';
import { masteryCap } from './mastery';

type Rules = typeof masteryRules;

/** Quality odds (%) for forging an item of `itemTier` at mastery `level`. */
export function qualityOdds(level: number, itemTier: number, rules: Rules = masteryRules): Record<Quality, number> {
  const below = Math.max(0, masteryCap(itemTier, rules) - level);
  if (below === 0) return rules.maxedOddsByTier[itemTier] ?? rules.odds[0];
  return rules.odds[Math.min(below, rules.odds.length - 1)];
}

export function rollQuality(odds: Record<Quality, number>, rng: Rng): Quality {
  return rng.weighted(
    QUALITIES.filter((q) => odds[q] > 0),
    (q) => odds[q],
  );
}

/** A piece's quality and (for forged pieces) its stat roll and restored relic. */
export type GearQualityRoll = Pick<GearInstance, 'quality'> & Partial<Pick<GearInstance, 'roll' | 'relicId'>>;

/** A piece's base stats: the item's, or the relic's budget-less-effect stats on a restored relic. */
export function pieceBaseStats(gear: Pick<GearInstance, 'itemId' | 'relicId'>): Partial<Stats> {
  return gear.relicId ? relicStats(relicById[gear.relicId]) : (itemById[gear.itemId] as GearDef).stats;
}

/** The stats quality, roll and affinity multiply; the extras (crit, evasion, speed, luck) stay flat. */
export const SCALING_KEYS: StatKey[] = ['hp', 'power', 'magic', 'armour', 'resistance'];

/** A piece's stats after its quality and stat roll, as `heroStats` adds them. Class affinity applies on top, in `heroStats`. */
export function gearStats(item: GearDef, gear: GearQualityRoll): Partial<Stats> {
  const multiplier = qualities[gear.quality].multiplier * (gear.roll ?? 1);
  return Object.fromEntries(
    Object.entries(pieceBaseStats({ itemId: item.id, relicId: gear.relicId })).map(([key, value]) => [
      key,
      SCALING_KEYS.includes(key as StatKey) ? value * multiplier : value,
    ]),
  );
}

/**
 * The stat values a forge can roll between two quality bounds, each combined
 * with the stat roll's extremes (see rollRules). The forge's confirm dialog
 * previews the Crappy…Uncommon band; Rare and Legendary stay a surprise.
 */
export function forgeStatRange(base: number, floor: Quality, ceiling: Quality): { min: number; max: number } {
  return {
    min: Math.round(base * qualities[floor].multiplier * rollRules.range.min),
    max: Math.round(base * qualities[ceiling].multiplier * rollRules.range.max),
  };
}
