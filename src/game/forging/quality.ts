import { masteryRules, QUALITIES, qualities } from '@/content/forging';
import { itemById, relicById } from '@/content/lookup';

import { relicStats } from '../equipment/budget';
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

/** A piece's quality and (for forged pieces) its stat roll and restored relic. */
export type GearQualityRoll = Pick<GearInstance, 'quality'> & Partial<Pick<GearInstance, 'roll' | 'relicId'>>;

/** A piece's base stats: the item's, or the relic's budget-less-effect stats on a restored relic. */
export function pieceBaseStats(gear: Pick<GearInstance, 'itemId' | 'relicId'>): Partial<Stats> {
  return gear.relicId ? relicStats(relicById[gear.relicId]) : (itemById[gear.itemId] as GearDef).stats;
}

/** A piece's stats after its quality and stat roll. Class affinity applies on top, in `heroStats`. */
export function gearStats(item: GearDef, gear: GearQualityRoll): Partial<Stats> {
  const multiplier = qualities[gear.quality].multiplier * (gear.roll ?? 1);
  return Object.fromEntries(Object.entries(pieceBaseStats({ itemId: item.id, relicId: gear.relicId })).map(([key, value]) => [key, value * multiplier]));
}
