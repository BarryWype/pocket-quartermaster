import { gatheringConfig } from '@/content/gatheringConfig';
import { resources as defaultResources } from '@/content/resources';
import { spawnConfig } from '@/content/spawnConfig';

import { simulateAutoWalk, simulateWalk } from '../balance/simulateWalk';
import { spawnYield } from '../gathering/gathering';
import { readSpawn } from '../gathering/lockedNodes';
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
  /** Spawns one lure adds, on average. */
  lureSpawns: number;
  /** Gathers per minute of walking, by number of pickaxes owned (0–5). */
  gathersPerMinute: number[];
  /** The same for auto-gather: the same starts and hours, walked without turning towards nodes. */
  autoPerMinute: Record<string, number>[];
  autoGathersPerMinute: number[];
  /** Locked ore nodes seen on the measured walks, by number of pickaxes owned: converted vs greyed, by the ore's pickaxe tier. */
  nodes: { converted: Record<number, number>; greyed: Record<number, number> }[];
};

/**
 * The measured walks' gathering config, without the daily walking bonus: the
 * rates are base rates, and the engine applies the bonus on top of them.
 */
export const baseWalkConfig = { ...gatheringConfig, walkingBonus: { ...gatheringConfig.walkingBonus, gathers: 0 } };

/** Changes when anything the measured walks depend on changes, so a cache can be keyed by it. */
export function walkCacheKey(config: SimConfig = simConfig) {
  const text = JSON.stringify([defaultResources, spawnConfig, gatheringConfig, config.walk.samples, config.walk.sampleHours, config.walk.sampleMinutes]);
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
  const measure = (tools: string[]) => {
    const save = { ...createInitialSave(), tools, tutorial: { step: 'done' as const, woodSpot: null } };
    const totals: Record<string, number> = {};
    const nodes = { converted: {} as Record<number, number>, greyed: {} as Record<number, number> };
    let gathers = 0;
    const autoTotals: Record<string, number> = {};
    let autoGathers = 0;
    samples.forEach((start, i) => {
      for (const hour of sampleHours) {
        const before = Object.keys(save.collected).length;
        const after = simulateWalk(
          save,
          start,
          Date.UTC(2026, 9, 20 + i, hour),
          sampleMinutes,
          baseWalkConfig,
          (spawn) => {
            const read = readSpawn(save, spawn);
            if (read.state === 'open') return;
            const tier = defaultResources.find((r) => r.id === spawn.resourceId)?.pickaxeTier ?? 0;
            const bucket = read.state === 'converted' ? nodes.converted : nodes.greyed;
            bucket[tier] = (bucket[tier] ?? 0) + 1;
          },
        );
        for (const [id, amount] of Object.entries(after.materials)) totals[id] = (totals[id] ?? 0) + amount;
        gathers += Math.max(0, Object.keys(after.collected).length - before);
        const auto = simulateAutoWalk(save, start, Date.UTC(2026, 9, 20 + i, hour), sampleMinutes, baseWalkConfig);
        for (const [id, amount] of Object.entries(auto.materials)) autoTotals[id] = (autoTotals[id] ?? 0) + amount;
        autoGathers += Object.keys(auto.collected).length;
      }
    });
    const walks = samples.length * sampleHours.length;
    const perMinute = (sums: Record<string, number>) =>
      Object.fromEntries(Object.entries(sums).map(([id, amount]) => [id, amount / walks / sampleMinutes]));
    return {
      materials: perMinute(totals),
      gathersPerMinute: gathers / (walks * sampleMinutes),
      autoMaterials: perMinute(autoTotals),
      autoGathersPerMinute: autoGathers / (walks * sampleMinutes),
      nodes,
    };
  };
  const sets = PICKAXES.map((_, i) => PICKAXES.slice(0, i)).concat([PICKAXES]);
  const measured = sets.map(measure);

  const lure: Record<string, number> = {};
  const lures = 50;
  let lureSpawnCount = 0;
  for (let i = 0; i < lures; i++) {
    const activatedAt = Date.UTC(2026, 9, 20) + i * 3_600_000;
    const spawns = lureSpawns({ id: `lure${i}`, activatedAt, center: samples[0] }, activatedAt);
    lureSpawnCount += spawns.length / lures;
    for (const spawn of spawns) {
      for (const { materialId, amount } of spawnYield(spawn)) lure[materialId] = (lure[materialId] ?? 0) + amount / lures;
    }
  }
  return {
    perMinute: measured.map((m) => m.materials),
    lure,
    lureSpawns: lureSpawnCount,
    gathersPerMinute: measured.map((m) => m.gathersPerMinute),
    autoPerMinute: measured.map((m) => m.autoMaterials),
    autoGathersPerMinute: measured.map((m) => m.autoGathersPerMinute),
    nodes: measured.map((m) => m.nodes),
  };
}

/** Rounds up with a chance equal to the fraction, so small rates still add up. */
export const roundRandom = (value: number, rng: Rng) => Math.floor(value) + (rng.chance(value - Math.floor(value)) ? 1 : 0);

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

/** Materials under the walking bonus: each stack scaled by the multiplier, rounded up. */
export const bonusScaled = (stacks: MaterialStack[], multiplier: number = gatheringConfig.walkingBonus.multiplier): MaterialStack[] =>
  stacks.map((stack) => ({ materialId: stack.materialId, amount: Math.ceil(stack.amount * multiplier) }));

/** Auto-gather's yield as a share of tapping's, per material, on the same walks with the pickaxes owned. */
export function autoYieldRatio(rates: WalkRates, pickaxes: number): Record<string, number> {
  const manual = rates.perMinute[pickaxes];
  const auto = rates.autoPerMinute[pickaxes];
  return Object.fromEntries(Object.keys(manual).map((id) => [id, (auto[id] ?? 0) / manual[id]]));
}
