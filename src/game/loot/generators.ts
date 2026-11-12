import { difficultyRules } from '@/content/difficulty';
import { gearId, gearRecipes } from '@/content/equipment';
import { LURE_ID, lootConfig } from '@/content/loot/config';
import { lootMatrix } from '@/content/loot/matrix';
import { relics as relicDefs } from '@/content/loot/relics';
import { resources } from '@/content/resources';
import { ELEMENTS, shardId, stoneId, type Element } from '@/game/elements';
import type { GearType } from '@/game/types';

import type { Rng } from '../generation/rng';
import { dedupeModifiers, partyLuck } from './chances';
import { rollLootGear } from './gear';
import { partWeights } from './parts';
import { rollLootTrinket } from './trinkets';
import type { LootRequest } from './roll';
import type { Loot, LootCategory, LootSourceId, MapRarity, TrophyDrop } from './types';

/** Fills one category's drop into the loot being built. */
export type Generator = (req: LootRequest, loot: Loot) => void;

/** The map's loot multiplier applies to gold at the treasure spot only. */
function mapMultiplier(req: LootRequest): number {
  if (req.source !== 'treasureSpot' || !req.mapRarity) return 1;
  return lootConfig.treasureMaps.lootMultiplier[req.mapRarity];
}

function percentBonus(req: LootRequest, kind: 'gold' | 'xp'): number {
  return dedupeModifiers(req.modifiers).reduce(
    (sum, mod) => (mod.kind === kind ? sum + mod.percent : sum),
    0,
  );
}

/** Difficulty scales material, shard and monster-part amounts, rounded half up, never below 1. */
function scaledAmount(req: LootRequest, raw: number): number {
  const multiplier = req.difficulty ? difficultyRules.rewards[req.difficulty].amount : 1;
  return Math.max(1, Math.round(raw * multiplier));
}

/** One pickaxe-covered resource: ore, stone or wood, weighted by its weight. */
function cacheMaterial(req: LootRequest, rng: Rng): { materialId: string; amount: number } {
  const pool = resources.filter(
    (resource) =>
      (resource.pickaxeTier ?? 0) <= req.context.pickaxeTier &&
      resource.kind !== 'herb' &&
      resource.kind !== 'animal',
  );
  const resource = rng.weighted(pool, (r) => r.weight);
  const [min, max] = lootConfig.quantities.materials;
  return { materialId: resource.yields[0].materialId, amount: scaledAmount(req, rng.int(min, max)) };
}

function materials(req: LootRequest, loot: Loot): void {
  // The single Patrol row keeps its per-kind flavour through `patrolThemes`.
  const theme =
    req.source === 'patrol' ? lootConfig.patrolThemes[req.patrolKind ?? 'goblins'] : lootConfig.materialThemes[req.source];
  if (!theme) return;
  // A listed ore the pickaxe can't mine yet belongs to a later tier.
  const minable = (id: string) =>
    (resources.find((r) => r.yields[0].materialId === id)?.pickaxeTier ?? 0) <= req.context.pickaxeTier;
  const options: (string | 'cache')[] = (theme.materials ?? []).filter(minable);
  if (theme.cache) options.push('cache');
  if (options.length === 0) return;
  const pick = options[req.rng.int(0, options.length - 1)];
  const [min, max] = lootConfig.quantities.materials;
  const stack =
    pick === 'cache'
      ? cacheMaterial(req, req.rng)
      : { materialId: pick, amount: scaledAmount(req, req.rng.int(min, max)) };
  loot.materials.push(stack);
}

function shards(req: LootRequest, loot: Loot): void {
  const element: Element = req.element ?? ELEMENTS[req.rng.int(0, ELEMENTS.length - 1)];
  const [min, max] = lootConfig.quantities.shards;
  loot.materials.push({ materialId: shardId(element), amount: scaledAmount(req, req.rng.int(min, max)) });
}

function blueprints(req: LootRequest, loot: Loot): void {
  const { favourWeights } = lootConfig.blueprints;
  const forgeable = (Object.keys(gearRecipes) as GearType[]).filter(
    (type) => gearRecipes[type][req.tier - 1].length > 0,
  );
  const pool = forgeable
    .map((type) => ({ type, id: gearId(type, req.tier) }))
    .filter(({ id }) => !req.context.knownRecipes.includes(id));
  if (pool.length > 0) {
    const last = favourWeights.length - 1;
    const pick = req.rng.weighted(
      pool,
      ({ type }) => favourWeights[Math.min(req.context.favourCounts[type] ?? 0, last)],
    );
    loot.recipeIds.push(pick.id);
    return;
  }
  // A complete tier: monster parts of the enemies' family, or gold when there were no enemies.
  if (req.enemies.length > 0) {
    noteTrophy(loot, { kind: 'overflow', parts: addParts(req, loot, lootConfig.blueprints.overflowParts) });
  } else {
    const gold = Math.round(lootConfig.blueprints.overflowGold * lootConfig.goldByTier[req.tier - 1]);
    loot.gold += gold;
    noteTrophy(loot, { kind: 'overflow', gold });
  }
}

function consumables(req: LootRequest, loot: Loot): void {
  const pool = lootConfig.consumables.filter(
    (entry) => req.context.playerTier >= entry.tiers[0] && req.context.playerTier <= entry.tiers[1],
  );
  const pick = req.rng.weighted(pool, (entry) => entry.weight);
  if (pick.itemId === LURE_ID) loot.lures += 1;
  else loot.consumables.push({ itemId: pick.itemId, amount: 1 });
}

function rarityByWeight(rng: Rng, weights: Record<MapRarity, number>): MapRarity {
  return rng.weighted(['common', 'rare', 'legendary'] as MapRarity[], (rarity) => weights[rarity]);
}

/** A random relic of `tier` (clamped 1–5); duplicates are allowed. */
export function randomRelic(tier: number, rng: Rng): string {
  const pool = relicDefs.filter((relic) => relic.tier === Math.min(5, Math.max(1, tier)));
  return pool[rng.int(0, pool.length - 1)].id;
}

function relicDrops(req: LootRequest, loot: Loot): void {
  loot.relics.push(randomRelic(req.tier, req.rng));
}

function monsterParts(req: LootRequest, loot: Loot): void {
  const pick = req.rng.weighted(partWeights(req.enemies, req.element), (entry) => entry.weight);
  const [min, max] =
    lootMatrix[req.source].marks.monsterParts === 'A'
      ? lootConfig.quantities.monsterPartsOnA
      : lootConfig.quantities.monsterParts;
  loot.materials.push({ materialId: pick.materialId, amount: scaledAmount(req, req.rng.int(min, max)) });
}

/** Adds a stack to the loot, merged with one of the same id. */
function addStack(loot: Loot, materialId: string, amount: number): void {
  const held = loot.materials.find((stack) => stack.materialId === materialId);
  if (held) held.amount += amount;
  else loot.materials.push({ materialId, amount });
}

/** A stack of one monster part of the enemies' family (the elites' when there are any), `range` in size; returns the amount. */
function addParts(req: LootRequest, loot: Loot, [min, max]: [number, number]): number {
  const elites = req.enemies.filter((id) => id.includes(':elite'));
  const weights = partWeights(elites.length > 0 ? elites : req.enemies, req.element);
  const pick = req.rng.weighted(weights, (entry) => entry.weight);
  const amount = req.rng.int(min, max);
  addStack(loot, pick.materialId, amount);
  return amount;
}

/** Notes a trophy or overflow drop apart, for reports. */
function noteTrophy(loot: Loot, drop: Partial<TrophyDrop> & Pick<TrophyDrop, 'kind'>): void {
  loot.trophies = [...(loot.trophies ?? []), { gold: 0, parts: 0, relics: 0, stones: 0, ...drop }];
}

/** What a source's trophy is, or null when its loot has no Trophies column (see lootConfig.trophies). */
export function trophyOf(source: LootSourceId): 'relic' | 'parts' | 'stone' | null {
  if (lootMatrix[source].marks.trophies === '—') return null;
  return lootConfig.trophies.bySource[source] ?? 'parts';
}

/** A boss's or elite's trophy, by source: a relic, monster parts or an elemental stone. */
function trophies(req: LootRequest, loot: Loot): void {
  const { parts } = lootConfig.trophies;
  const kind = trophyOf(req.source) ?? 'parts';
  if (kind === 'relic') {
    loot.relics.push(randomRelic(req.tier, req.rng));
    noteTrophy(loot, { kind, relics: 1 });
  } else if (kind === 'stone') {
    addStack(loot, stoneId(req.element ?? ELEMENTS[req.rng.int(0, ELEMENTS.length - 1)]), 1);
    noteTrophy(loot, { kind, stones: 1 });
  } else {
    noteTrophy(loot, { kind: 'parts', parts: addParts(req, loot, parts) });
  }
}

export const generators: Record<LootCategory, Generator> = {
  gold: (req, loot) => {
    const { goldPerPoint } = lootConfig.luck;
    loot.gold = Math.round(
      req.base.gold * (1 + goldPerPoint * partyLuck(req.luck, req.modifiers)) * (1 + percentBonus(req, 'gold') / 100) * mapMultiplier(req),
    );
  },
  xp: (req, loot) => {
    loot.xp = Math.round(req.base.xp * (1 + percentBonus(req, 'xp') / 100));
  },
  materials,
  monsterParts,
  shards,
  blueprints,
  gear: (req, loot) => {
    loot.gear.push(rollLootGear(req));
  },
  trinkets: (req, loot) => {
    loot.gear.push(rollLootTrinket(req));
  },
  trophies,
  relics: relicDrops,
  consumables,
  treasureMaps: (req, loot) => {
    loot.treasureMaps.push({ rarity: rarityByWeight(req.rng, lootConfig.treasureMaps.rarityWeights), tier: req.tier });
  },
  manuals: (req, loot) => {
    loot.manuals.push(rarityByWeight(req.rng, lootConfig.manuals.rarityWeights));
  },
  keyFragments: (_req, loot) => {
    loot.keyFragments += 1;
  },
};
