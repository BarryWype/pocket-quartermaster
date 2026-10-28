import { masteryRules, QUALITIES, qualities } from '@/content/forging';

import type { Rng } from '../generation/rng';
import type { GearDef, GearInstance, Quality, Stats } from '../types';
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

/** A piece's quality and (for forged pieces) its stat roll. */
export type GearQualityRoll = Pick<GearInstance, 'quality'> & Partial<Pick<GearInstance, 'roll'>>;

/** A piece's stats after its quality and stat roll. Class affinity applies on top, in `heroStats`. */
export function gearStats(item: GearDef, gear: GearQualityRoll): Partial<Stats> {
  const multiplier = qualities[gear.quality].multiplier * (gear.roll ?? 1);
  return Object.fromEntries(Object.entries(item.stats).map(([key, value]) => [key, value * multiplier]));
}
