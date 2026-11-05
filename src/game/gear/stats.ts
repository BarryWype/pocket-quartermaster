import { gearRules, type Rarity } from '@/content/gear';
import { itemById, relicById } from '@/content/lookup';

import { relicStats } from '../equipment/budget';
import type { Rng } from '../generation/rng';
import type { GearDef, GearInstance, StatKey, Stats } from '../types';

/**
 * A dice total (3..18), lifted by the rarity's shift and mapped linearly onto
 * gearRules.statRange: 3 → min, 18 → max.
 */
export function statFactor(total: number, rarity: Rarity): number {
  const shifted = Math.min(18, Math.max(3, total + gearRules.rarityShift[rarity]));
  const { min, max } = gearRules.statRange;
  return min + ((max - min) * (shifted - 3)) / 15;
}

/** The piece's stat dice: 3d6, before the rarity shift. */
export function rollStatDice(rng: Rng): number {
  const { count, sides } = gearRules.dice;
  let total = 0;
  for (let i = 0; i < count; i++) total += rng.int(1, sides);
  return total;
}

/** A piece's base stats: the item's, or the relic's budget-less-effect stats on a restored relic. */
export function pieceBaseStats(gear: Pick<GearInstance, 'itemId' | 'relicId'>): Partial<Stats> {
  return gear.relicId ? relicStats(relicById[gear.relicId]) : (itemById[gear.itemId] as GearDef).stats;
}

/** The stats the dice factor multiplies; the extras (crit, evasion, speed, luck) stay flat. */
export const SCALING_KEYS: StatKey[] = ['hp', 'power', 'magic', 'armour', 'resistance'];

/**
 * A piece's stats after its dice roll and rarity shift, as `heroStats` adds
 * them. A non-relic piece with a unique keeps its item's base stats. Class
 * affinity applies on top, in `heroStats`.
 */
export function gearStats(piece: Pick<GearInstance, 'itemId' | 'relicId' | 'roll' | 'rarity'>): Partial<Stats> {
  const factor = statFactor(piece.roll, piece.rarity);
  return Object.fromEntries(
    Object.entries(pieceBaseStats(piece)).map(([key, value]) => [
      key,
      SCALING_KEYS.includes(key as StatKey) ? value * factor : value,
    ]),
  ) as Partial<Stats>;
}

/** The stat values a piece can roll at `rarity`, for the forge preview. */
export function statRange(base: number, rarity: Rarity): { min: number; max: number } {
  return { min: Math.round(base * statFactor(3, rarity)), max: Math.round(base * statFactor(18, rarity)) };
}
