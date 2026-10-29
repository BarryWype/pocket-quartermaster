import { gatheringConfig, type GatheringConfig } from '@/content/gatheringConfig';
import { itemById } from '@/content/lookup';
import type { PatrolRules } from '@/content/patrols';
import { resources as defaultResources } from '@/content/resources';

import { highestUnlockedTier } from '../dungeons/unlock';
import { offsetPosition } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import type { AnimalSpawn, LatLng, ResourceDef, Spawn } from '../generation/types';
import type { SaveData } from '../save';
import type { WalkEffect, WalkEffectKind } from '../types';

/** Which walking effect an item gives, or null for anything else. */
export function walkKind(itemId: string): WalkEffectKind | null {
  const item = itemById[itemId];
  return item?.slot === 'utility' && item.walk ? item.walk : null;
}

/** The effect of a kind covering a moment, or null: an effect runs [startedAt, endsAt). */
export function walkEffectAt(effects: WalkEffect[], kind: WalkEffectKind, t: number): WalkEffect | null {
  return effects.find((effect) => walkKind(effect.itemId) === kind && effect.startedAt <= t && t < effect.endsAt) ?? null;
}

/** The effects still running, for the map. */
export function activeWalkEffects(save: SaveData, now: number): WalkEffect[] {
  return save.walkEffects.filter((effect) => effect.endsAt > now);
}

/** Whether using the item would throw away one of its own still running (the UI asks first). */
export function replacesActive(save: SaveData, itemId: string, now: number): boolean {
  return save.walkEffects.some((effect) => effect.itemId === itemId && effect.endsAt > now);
}

/** Uses a walking consumable from the stock where the player stands; using it again restarts its timer. */
export function startWalkEffect(
  save: SaveData,
  itemId: string,
  position: LatLng,
  now: number,
  config: GatheringConfig = gatheringConfig,
): SaveData {
  const kind = walkKind(itemId);
  if (!kind) throw new Error(`Not a walking consumable: ${itemId}`);
  if ((save.consumables[itemId] ?? 0) < 1) throw new Error(`No ${itemId} left`);
  const minutes = config.walkEffects[kind].minutes;
  return {
    ...save,
    consumables: { ...save.consumables, [itemId]: save.consumables[itemId] - 1 },
    walkEffects: [
      ...save.walkEffects.filter((effect) => effect.itemId !== itemId),
      { id: `walk${save.nextUid}`, itemId, startedAt: now, endsAt: now + minutes * 60_000, center: position },
    ],
    nextUid: save.nextUid + 1,
  };
}

/** Ends the item's effect at once (debug). */
export function endWalkEffect(save: SaveData, itemId: string, now: number): SaveData {
  return { ...save, walkEffects: save.walkEffects.map((effect) => (effect.itemId === itemId ? { ...effect, endsAt: now } : effect)) };
}

/** A random point within `radius` metres, spread evenly over the disc. */
export function pointAround(center: LatLng, radius: number, rng: Rng) {
  const distance = radius * Math.sqrt(rng.next());
  const bearing = rng.next() * 2 * Math.PI;
  return offsetPosition(center, Math.cos(bearing) * distance, Math.sin(bearing) * distance);
}

/** Animals drawn to a point over a window, fixed by their seed and start; shared by the lure and the musk. */
export function animalSpawns(
  { id, center, start, end, count, radius, seed }: { id: string; center: LatLng; start: number; end: number; count: number; radius: number; seed: string },
  resources: ResourceDef[] = defaultResources,
): AnimalSpawn[] {
  const rng = createRng(`${seed}|${start}`);
  const animals = resources.filter((r) => r.kind === 'animal');
  return Array.from({ length: count }, (_, i) => {
    const home = pointAround(center, radius, rng);
    return {
      id: `${id}:animal${i}`,
      kind: 'animal',
      resourceId: rng.weighted(animals, (r) => r.weight).id,
      tile: id,
      quantity: rng.int(1, 2),
      boosted: false,
      expiresAt: end,
      path: {
        waypoints: Array.from({ length: 4 }, () => pointAround(home, 40, rng)),
        loopMs: 20 * 60_000,
        phaseMs: Math.floor(rng.next() * 20 * 60_000),
      },
    };
  });
}

/** The animals hunter's musk draws, while each of its effects runs. */
export function walkEffectSpawns(effects: WalkEffect[], t: number, config: GatheringConfig = gatheringConfig): AnimalSpawn[] {
  const musk = config.walkEffects.musk;
  return effects.flatMap((effect) => {
    if (walkKind(effect.itemId) !== 'musk' || effect.startedAt > t || t >= effect.endsAt) return [];
    return animalSpawns({ id: effect.id, center: effect.center, start: effect.startedAt, end: effect.endsAt, count: musk.animals, radius: musk.radiusMeters, seed: effect.id });
  });
}

/** When the tracker's eye runs: kept in the background state, which has no save. */
export type TrackWindow = { startedAt: number; endsAt: number };

export function trackWindows(effects: WalkEffect[]): TrackWindow[] {
  return effects
    .filter((effect) => walkKind(effect.itemId) === 'track')
    .map((effect) => ({ startedAt: effect.startedAt, endsAt: effect.endsAt }));
}

/** Patrol rules at a moment: the tracker's eye multiplies how far patrols show while it runs. */
export function patrolRulesAt(rules: PatrolRules, windows: TrackWindow[], t: number, config: GatheringConfig = gatheringConfig): PatrolRules {
  if (!windows.some((window) => window.startedAt <= t && t < window.endsAt)) return rules;
  return { ...rules, visibleMeters: rules.visibleMeters * config.walkEffects.track.rangeMultiplier };
}

/** Ore of the player's highest tier or above is rare (stone is tier 2 … coal tier 5); locked nodes count too. */
function isRareOre(spawn: Spawn, top: number, resources: ResourceDef[]) {
  if (spawn.kind !== 'ore') return false;
  const tier = resources.find((r) => r.id === spawn.resourceId)?.pickaxeTier ?? 0;
  return tier + 1 >= top;
}

/** Per-spawn range multiplier for the map: rare ore shows from further while the tracker's eye runs. */
export function trackedRange(
  save: SaveData,
  now: number,
  config: GatheringConfig = gatheringConfig,
  resources: ResourceDef[] = defaultResources,
): (spawn: Spawn) => number {
  if (!walkEffectAt(save.walkEffects, 'track', now)) return () => 1;
  const top = highestUnlockedTier(save);
  return (spawn) => (isRareOre(spawn, top, resources) ? config.walkEffects.track.rangeMultiplier : 1);
}
