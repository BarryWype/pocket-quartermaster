import type { ImageSourcePropType } from 'react-native';

import type { MaterialStack } from '../types';

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export type ResourceKind = 'wood' | 'ore' | 'animal' | 'herb';

export type ResourceDef = {
  id: string;
  kind: ResourceKind;
  name: string;
  emoji: string;
  icon?: ImageSourcePropType;
  weight: number;
  /** Weight multiplier per time of day. */
  boosts?: Partial<Record<TimeOfDay, number>>;
  /** Lowest pickaxe tier able to gather it; omitted when no tool is needed. */
  pickaxeTier?: number;
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
  /** Spawn quantity is rolled in [1, maxQuantity]. */
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
  kind: 'wood' | 'ore' | 'herb';
  position: LatLng;
};

export type AnimalSpawn = SpawnBase & {
  kind: 'animal';
  path: AnimalPath;
};

export type Spawn = StaticSpawn | AnimalSpawn;
