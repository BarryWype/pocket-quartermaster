import { supplyRules } from '@/content/supplyLines';
import type { SupplyResource } from '@/content/supplyLines';

import { createRng } from '../generation/rng';
import type { Terrain } from './types';

/**
 * A cell's richness, 0–3, rolled from the resource, the cell and the period, so
 * it is the same for every player. A terrain the resource cannot grow on
 * (timber off green) has no richness at all.
 */
export function cellRichness(cell: string, period: number, terrain: Terrain, resource: SupplyResource): 0 | 1 | 2 | 3 {
  const weights = supplyRules.richness[resource][terrain];
  if (!weights) return 0;
  return createRng(`richness|${resource}|${cell}|${period}`).weighted([0, 1, 2, 3], (level) => weights[level]);
}
