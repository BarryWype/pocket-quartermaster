import type { SpawnConfig } from '@/game/generation/types';

// Geohash precision 6 ≈ 1.2 × 0.6 km, precision 7 ≈ 150 × 150 m.
// A tile plus its neighbours must cover the visibility range of its kind.
// Every node gives 1–2 per tap (maxQuantity 2).
// Densities are tuned against src/game/balance/balance.test.ts.
export const spawnConfig: SpawnConfig = {
  kinds: {
    // Wood and ore are both building materials, so they share the long range.
    // Same density as before on precision 7 (0.4 × 1–2 per tile, ~32 of them per precision 6 tile).
    wood: {
      precision: 6,
      windowMinutes: 3 * 60,
      visibilityMeters: 300,
      minPerTile: 15,
      maxPerTile: 23,
      maxQuantity: 2,
      tileChance: 1,
    },
    ore: {
      precision: 6,
      windowMinutes: 6 * 60,
      visibilityMeters: 300,
      minPerTile: 12,
      maxPerTile: 20,
      maxQuantity: 2,
      tileChance: 1,
    },
    animal: {
      precision: 7,
      windowMinutes: 60,
      visibilityMeters: 150,
      minPerTile: 1,
      maxPerTile: 1,
      maxQuantity: 2,
      // Raised from 0.15 with the pacing pass: casual players were short of hide and meat,
      // and the kitchen was using more than the 60–80% target share of the food gathered.
      tileChance: 0.28,
    },
    herb: {
      precision: 7,
      windowMinutes: 3 * 60,
      visibilityMeters: 100,
      minPerTile: 1,
      maxPerTile: 1,
      maxQuantity: 2,
      // Raised from 0.5 with the pacing pass: more herbs and berries for food and potions.
      // Lowered from 0.8 when the range went from 50 to 100 m, to keep the yield per walk.
      tileChance: 0.7,
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
