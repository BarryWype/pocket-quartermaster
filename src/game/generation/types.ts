import type { MaterialStack } from '../types';

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export type ResourceKind = 'ore' | 'animal' | 'herb' | 'rare';

export type ResourceDef = {
  id: string;
  kind: ResourceKind;
  name: string;
  emoji: string;
  weight: number;
  /** Weight multiplier per time of day. Boosted resources also spawn with +1 quantity. */
  boosts?: Partial<Record<TimeOfDay, number>>;
  /** Materials gained per unit of spawn quantity. */
  yields: MaterialStack[];
};

export type KindConfig = {
  /** Geohash precision of the tiles this kind spawns in. */
  precision: number;
  windowMinutes: number;
  visibilityMeters: number;
  minPerTile: number;
  maxPerTile: number;
  /** Spawn quantity is rolled in [1, maxQuantity], +1 when boosted. */
  maxQuantity: number;
  /** Probability that a tile has any spawns of this kind in a given window. */
  tileChance: number;
};

export type SpawnConfig = {
  kinds: Record<ResourceKind, KindConfig>;
  /** Solar hours (0-24) at which each period starts. */
  timeOfDay: Record<TimeOfDay, number>;
  animal: {
    waypoints: number;
    loopMinutes: number;
  };
};

export type AnimalPath = {
  waypoints: LatLng[];
  loopMs: number;
  phaseMs: number;
};

type SpawnBase = {
  id: string;
  resourceId: string;
  tile: string;
  quantity: number;
  boosted: boolean;
  expiresAt: number;
};

export type StaticSpawn = SpawnBase & {
  kind: 'ore' | 'herb' | 'rare';
  position: LatLng;
};

export type AnimalSpawn = SpawnBase & {
  kind: 'animal';
  path: AnimalPath;
};

export type Spawn = StaticSpawn | AnimalSpawn;
