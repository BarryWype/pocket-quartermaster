import { masteryRules, rollRules } from '@/content/forging';

import { createRng } from '../generation/rng';
import { masteryCap } from './mastery';

type Rules = typeof rollRules;

/** Exponent k so `1 - u^k` lands in the upper half with chance `share`. */
function tiltExponent(rules: Rules) {
  const share = Math.min(1, Math.max(0.5, rules.tilt.capUpperHalf));
  return Math.log(0.5) / Math.log(share);
}

/**
 * A forged piece's stat factor: uniform at mastery level 1, tilted towards the
 * top as mastery climbs so that at the item tier's cap about `capUpperHalf` of
 * rolls land in the upper half. Seeded by the piece's uid, like its quality,
 * so it can't be rerolled by reopening.
 */
export function rollStatFactor(uid: string, masteryLevel: number, itemTier: number, rules: Rules = rollRules): number {
  const rng = createRng(`${uid}|roll`);
  const climb = Math.min(1, Math.max(0, masteryLevel / masteryCap(itemTier, masteryRules)));
  const value = 1 - rng.next() ** (1 + (tiltExponent(rules) - 1) * climb);
  const { min, max } = rules.range;
  return Math.round((min + (max - min) * value) * 100) / 100;
}

/** The roll on the 1–7 scale shown to players: 1 is the lowest, 4 about neutral, 7 the highest. */
export function rollToScale(roll: number, rules: Rules = rollRules): number {
  const { min, max } = rules.range;
  return Math.min(7, Math.max(1, Math.round(1 + ((roll - min) / (max - min)) * 6)));
}
