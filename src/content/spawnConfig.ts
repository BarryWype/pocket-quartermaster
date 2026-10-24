import type { SpawnConfig } from '@/game/generation/types';

// Geohash precision 6 ≈ 1.2 × 0.6 km, precision 7 ≈ 150 × 150 m.
// A tile plus its neighbours must cover the visibility range of its kind.
// Densities are tuned against src/game/balance/balance.test.ts.
export const spawnConfig: SpawnConfig = {
  kinds: {
    ore: {
      precision: 6,
      windowMinutes: 6 * 60,
      visibilityMeters: 500,
      minPerTile: 3,
      maxPerTile: 6,
      maxQuantity: 3,
      tileChance: 1,
    },
    animal: {
      precision: 7,
      windowMinutes: 60,
      visibilityMeters: 150,
      minPerTile: 1,
      maxPerTile: 1,
      maxQuantity: 1,
      tileChance: 0.15,
    },
    herb: {
      precision: 7,
      windowMinutes: 3 * 60,
      visibilityMeters: 50,
      minPerTile: 1,
      maxPerTile: 1,
      maxQuantity: 3,
      tileChance: 0.5,
    },
    rare: {
      precision: 6,
      windowMinutes: 60,
      visibilityMeters: 200,
      minPerTile: 1,
      maxPerTile: 1,
      maxQuantity: 1,
      tileChance: 0.08,
    },
  },
  timeOfDay: {
    dawn: 5,
    day: 8,
    dusk: 17,
    night: 20,
  },
  animal: {
    waypoints: 4,
    loopMinutes: 20,
  },
};
