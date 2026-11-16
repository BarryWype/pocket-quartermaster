import { supplyRules } from '@/content/supplyLines';
import type { SupplyResource } from '@/content/supplyLines';

import { createRng } from '../generation/rng';
import { cellAt } from '../discovery/cells';
import { cellRichness } from './richness';
import type { Terrain } from './types';

const origin = { latitude: -41.2865, longitude: 174.7762 };

const cells = (count: number) => {
  const rng = createRng('richness-cells');
  return Array.from({ length: count }, () =>
    cellAt({ latitude: -41.35 + rng.next() * 0.2, longitude: 174.65 + rng.next() * 0.4 }),
  );
};

describe('cellRichness', () => {
  it('is deterministic and moves with the period for some cells', () => {
    const sample = cells(200);
    for (const cell of sample) {
      expect(cellRichness(cell, 0, 'green', 'game')).toBe(cellRichness(cell, 0, 'green', 'game'));
    }
    const moving = sample.filter((cell) => cellRichness(cell, 0, 'green', 'game') !== cellRichness(cell, 1, 'green', 'game'));
    expect(moving.length).toBeGreaterThan(0);
  });

  it('spreads 5,000 cells within 3 points of the weights', () => {
    const resource: SupplyResource = 'game';
    const terrain: Terrain = 'green';
    const weights = supplyRules.richness[resource][terrain]!;
    const counts = [0, 0, 0, 0];
    for (const cell of cells(5000)) counts[cellRichness(cell, 0, terrain, resource)]++;
    counts.forEach((count, level) => {
      expect(Math.abs(count / 5000 - weights[level])).toBeLessThanOrEqual(0.03);
    });
  });

  it('gives timber no richness off green', () => {
    const cell = cellAt(origin);
    for (const terrain of ['waterside', 'built'] as Terrain[]) {
      expect(cellRichness(cell, 0, terrain, 'timber')).toBe(0);
    }
  });
});
