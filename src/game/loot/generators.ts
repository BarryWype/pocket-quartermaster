import { gearId, gearRecipes } from '@/content/equipment';
import { LURE_ID, lootConfig } from '@/content/loot/config';
import { resources } from '@/content/resources';
import { ELEMENTS, shardId, type Element } from '@/game/elements';
import type { GearType } from '@/game/types';

import type { Rng } from '../generation/rng';
import { dedupeModifiers, partyLuck } from './chances';
import { rollLootGear } from './gear';
import type { LootRequest } from './roll';
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
  const unknown = (Object.keys(gearRecipes) as GearType[])
    .filter((type) => gearRecipes[type][req.tier - 1].length > 0)
    .map((type) => gearId(type, req.tier))
    .filter((id) => !req.context.knownRecipes.includes(id));
  const favoured = unknown.filter((id) => {
    const type = id.replace(/\d+$/, '') as GearType;
    return req.context.favouredTypes.includes(type);
  });
  const pool = favoured.length > 0 ? favoured : unknown;
  if (pool.length === 0) return;
  loot.recipeIds.push(pool[req.rng.int(0, pool.length - 1)]);
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

// Trinkets, components, relics, monster parts and valuables: filled by later prompts.
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
  trinkets: later,
  components: later,
  relics: later,
  monsterParts: later,
  valuables: later,
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
