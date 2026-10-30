import { masteryRules, rollRules } from '@/content/forging';

import { createRng, type Rng } from '../generation/rng';
import { masteryCap } from './mastery';

type Rules = typeof rollRules;

/**
 * A forged piece's stat factor: `count` dice of `sides` rolled on a bell curve,
 * raised by `shift`, mapped linearly onto the multiplier range so the middle of
 * the curve lands on the centre of the range.
 */
export function statRollFromDice(rng: Rng, shift = 0, rules: Rules = rollRules): number {
  const { count, sides } = rules.dice;
  let total = shift;
  for (let i = 0; i < count; i++) total += rng.int(1, sides);
  const clamped = Math.min(count * sides, Math.max(count, total));
  const { min, max } = rules.range;
  const share = (clamped - count) / (count * sides - count);
  return Math.round((min + (max - min) * share) * 100) / 100;
}

/**
 * A forged piece's stat factor on the 3d6 bell curve, shifted up by mastery:
 * the full `masteryShift` at the item tier's cap. Seeded by the piece's uid,
 * like its quality, so it can't be rerolled by reopening.
 */
export function rollStatFactor(uid: string, masteryLevel: number, itemTier: number, rules: Rules = rollRules): number {
  const rng = createRng(`${uid}|roll`);
  const climb = Math.min(1, Math.max(0, masteryLevel / masteryCap(itemTier, masteryRules)));
  return statRollFromDice(rng, climb * rules.masteryShift, rules);
}

/** The roll on the 1–7 scale shown to players: 1 is the lowest, 4 about neutral, 7 the highest. */
export function rollToScale(roll: number, rules: Rules = rollRules): number {
  const { min, max } = rules.range;
  return Math.min(7, Math.max(1, Math.round(1 + ((roll - min) / (max - min)) * 6)));
}
