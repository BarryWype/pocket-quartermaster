import { gearId, gearRecipes } from '@/content/equipment';
import { LURE_ID, lootConfig } from '@/content/loot/config';
import { resources } from '@/content/resources';
import { ELEMENTS, shardId, type Element } from '@/game/elements';
import type { GearType } from '@/game/types';

import { masteryCap } from '../forging/mastery';
import type { Rng } from '../generation/rng';
import { dedupeModifiers, partyLuck } from './chances';
import { rollLootGear } from './gear';
import { rollLootTrinket } from './trinkets';
import type { LootRequest } from './roll';
import { rollValuable } from './valuables';
import type { Loot, LootCategory, MapRarity } from './types';

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
  return { materialId: resource.yields[0].materialId, amount: rng.int(min, max) };
}

function materials(req: LootRequest, loot: Loot): void {
  const theme = lootConfig.materialThemes[req.source];
  if (!theme) return;
  const options: (string | 'cache')[] = [...(theme.materials ?? [])];
  if (theme.cache) options.push('cache');
  const pick = options[req.rng.int(0, options.length - 1)];
  const [min, max] = lootConfig.quantities.materials;
  const stack =
    pick === 'cache'
      ? cacheMaterial(req, req.rng)
      : { materialId: pick, amount: req.rng.int(min, max) };
  loot.materials.push(stack);
}

function shards(req: LootRequest, loot: Loot): void {
  const element: Element = req.element ?? ELEMENTS[req.rng.int(0, ELEMENTS.length - 1)];
  const [min, max] = lootConfig.quantities.shards;
  loot.materials.push({ materialId: shardId(element), amount: req.rng.int(min, max) });
}

function blueprints(req: LootRequest, loot: Loot): void {
  const { favourWeights, tierCompleteForges, componentShare } = lootConfig.blueprints;
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
  if (componentShare > 0 && req.rng.chance(componentShare)) {
    generators.components(req, loot);
    return;
  }
  const cap = masteryCap(req.tier);
  const belowCap = forgeable.filter((type) => (req.context.mastery[type]?.level ?? 1) < cap);
  const types = belowCap.length > 0 ? belowCap : forgeable;
  const type = types[req.rng.int(0, types.length - 1)];
  loot.mastery.push({ type, tier: req.tier, forges: tierCompleteForges });
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

// Components, relics and monster parts: filled by later prompts.
const later: Generator = () => {};

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
  shards,
  blueprints,
  gear: (req, loot) => {
    loot.gear.push(rollLootGear(req));
  },
  trinkets: (req, loot) => {
    loot.gear.push(rollLootTrinket(req));
  },
  components: later,
  relics: later,
  monsterParts: later,
  valuables: (req, loot) => {
    loot.valuables.push(rollValuable(req));
  },
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
