import { placeGroups, type PlaceGroup } from '@/content/places';

import type { LatLng } from '../generation/types';
import { tilesWithin } from '../generation/tiles';
import { nearestByGroup } from './density';
import { generateTilePlaces } from './generate';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const base = Date.UTC(2026, 9, 26, 12);
/** Positions spread over 4 latitude bands: equator, Wellington, 50°N and 60°N. */
const positions: LatLng[] = [0.01, -41.29, 50.0, 60.0].flatMap((latitude) =>
  Array.from({ length: 12 }, (_, i) => ({ latitude, longitude: 7 + i * 0.08 })),
);
const times = Array.from({ length: 6 }, (_, i) => base + i * DAY_MS);

/** Nearest spawn of a group over a 3 km box, wider than the map uses, to avoid edge effects. */
function groupNearest(group: PlaceGroup, position: LatLng, timeMs: number): number | undefined {
  const spawns = tilesWithin(position, 3000, group.precision).flatMap((tile) => generateTilePlaces(group, tile, timeMs));
  return nearestByGroup(spawns, position)[group.id];
}

describe('place density', () => {
  it('brings the nearest place of each group within 20% of 1/(2√density)', () => {
    const sums = new Map<string, { total: number; count: number }>();
    for (const position of positions) {
      for (const timeMs of times) {
        for (const group of placeGroups) {
          const d = groupNearest(group, position, timeMs);
          if (d === undefined) continue;
          const entry = sums.get(group.id) ?? { total: 0, count: 0 };
          entry.total += d;
          entry.count += 1;
          sums.set(group.id, entry);
        }
      }
    }
    const means: Record<string, number> = {};
    for (const group of placeGroups) {
      const entry = sums.get(group.id);
      expect(entry?.count ?? 0).toBeGreaterThan(100);
      const mean = entry!.total / entry!.count;
      means[group.id] = mean;
      const expectedM = (1 / (2 * Math.sqrt(group.densityPerKm2))) * 1000;
      expect(mean).toBeGreaterThan(expectedM * 0.8);
      expect(mean).toBeLessThan(expectedM * 1.2);
    }
    if (process.env.PLACES_REPORT) {
      console.table(
        placeGroups.map((group) => ({
          group: group.id,
          density: group.densityPerKm2,
          'mean nearest (m)': Math.round(means[group.id]),
          'expected (m)': Math.round((1 / (2 * Math.sqrt(group.densityPerKm2))) * 1000),
        })),
      );
    }
  });
});
