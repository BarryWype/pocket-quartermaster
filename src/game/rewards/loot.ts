import type { Rng } from '../generation/rng';
import type { LootEntry, MaterialStack } from '../types';

/**
 * Rolls every entry. Both rolls always happen so later rolls from the same
 * RNG stay stable when the table is used conditionally.
 */
export function rollLoot(rng: Rng, entries: LootEntry[]): MaterialStack[] {
  return entries.flatMap((entry) => {
    const dropped = rng.chance(entry.chance);
    const amount = rng.int(entry.min, entry.max);
    return dropped ? [{ materialId: entry.materialId, amount }] : [];
  });
}
