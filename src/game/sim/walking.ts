import { gatheringConfig } from '@/content/gatheringConfig';
import { resources } from '@/content/resources';
import { spawnConfig } from '@/content/spawnConfig';

import { simulateWalk } from '../balance/simulateWalk';
import { spawnYield } from '../gathering/gathering';
import type { Rng } from '../generation/rng';
import { lureSpawns } from '../rewards/lures';
import { createInitialSave } from '../save';
import type { MaterialStack } from '../types';
import { simConfig, type SimConfig } from './config';

export const PICKAXES = ['woodPickaxe', 'stonePickaxe', 'copperPickaxe', 'ironPickaxe', 'steelPickaxe'];

export type WalkRates = {
  /** Materials per minute of walking, by number of pickaxes owned (0–5). */
  perMinute: Record<string, number>[];
  /** Materials from one lure's spawns. */
  lure: Record<string, number>;
};

/** Changes when anything the measured walks depend on changes, so a cache can be keyed by it. */
export function walkCacheKey(config: SimConfig = simConfig) {
  const text = JSON.stringify([resources, spawnConfig, gatheringConfig, config.walk.samples, config.walk.sampleHours, config.walk.sampleMinutes]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

/**
 * The average yield per minute of `simulateWalk` for each pickaxe set, at the
 * sample places and hours, plus what a lure's spawns hold. Slow: cache it.
 */
export function measureWalkRates(config: SimConfig = simConfig): WalkRates {
  const { samples, sampleHours, sampleMinutes } = config.walk;
  const perMinute = PICKAXES.map((_, i) => PICKAXES.slice(0, i)).concat([PICKAXES]).map((tools) => {
    const save = { ...createInitialSave(), tools, tutorial: { step: 'done' as const, woodSpot: null } };
    const totals: Record<string, number> = {};
    samples.forEach((start, i) => {
      for (const hour of sampleHours) {
        const after = simulateWalk(save, start, Date.UTC(2026, 9, 20 + i, hour), sampleMinutes);
        for (const [id, amount] of Object.entries(after.materials)) totals[id] = (totals[id] ?? 0) + amount;
      }
    });
    const walks = samples.length * sampleHours.length;
    return Object.fromEntries(Object.entries(totals).map(([id, amount]) => [id, amount / walks / sampleMinutes]));
  });

  const lure: Record<string, number> = {};
  const lures = 50;
  for (let i = 0; i < lures; i++) {
    const activatedAt = Date.UTC(2026, 9, 20) + i * 3_600_000;
    for (const spawn of lureSpawns({ id: `lure${i}`, activatedAt, center: samples[0] }, activatedAt)) {
      for (const { materialId, amount } of spawnYield(spawn)) lure[materialId] = (lure[materialId] ?? 0) + amount / lures;
    }
  }
  return { perMinute, lure };
}

/** Rounds up with a chance equal to the fraction, so small rates still add up. */
const roundRandom = (value: number, rng: Rng) => Math.floor(value) + (rng.chance(value - Math.floor(value)) ? 1 : 0);

/** A walk's materials: the measured average × minutes × efficiency, varied by up to ±variation. */
export function walkYield(
  rates: Record<string, number>,
  minutes: number,
  rng: Rng,
  config: SimConfig = simConfig,
): MaterialStack[] {
  const { efficiency, variation } = config.walk;
  const factor = efficiency * (1 + variation * (2 * rng.next() - 1));
  return Object.entries(rates)
    .map(([materialId, rate]) => ({ materialId, amount: roundRandom(rate * minutes * factor, rng) }))
    .filter((stack) => stack.amount > 0);
}
