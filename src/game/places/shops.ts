import { placeRules } from '@/content/places';
import { lootConfig } from '@/content/loot/config';
import type { ValuableBuyer } from '@/content/loot/valuables';
import { dungeons } from '@/content/dungeons';
import { itemById, recipeById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { itemPrices, marketPool, materialPrices, oreTier, shopRules, shopStock } from '@/content/shops';
import { bossWeaknesses, weaknessByItem } from '@/content/weaknesses';

import { forgedItem, isKnown, unlockRecipe } from '../crafting/crafting';
import { highestUnlockedTier } from '../dungeons/unlock';
import { distanceMeters } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import { wornBy } from '../forging/salvage';
import { pickaxeTier } from '../gathering/gathering';
import { addMaterials, removeMaterials } from '../inventory';
import { valuableSellPrice, todaysCollector } from '../loot/valuables';
import type { SaveData } from '../save';
import { affinityOf } from '../team/team';
import type { GearDef, GearInstance, Quality, RecipeDef } from '../types';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from './generate';
import { isLockedMine } from './generate';

export type StockLine = {
  key: string;
  kind: 'material' | 'item' | 'gear' | 'recipe';
  id: string;
  amount: number;
  price: number;
  /** Gear lines carry the piece on sale; the real uid is assigned on purchase. */
  gear?: GearInstance;
};

const gearPrice = (item: GearDef, quality: Quality) => Math.round(shopRules.gearPrice[item.tier - 1] * shopRules.qualityPrice[quality]);

/** A recipe a shop can teach: unknown, not given by default or tier, and within the player's tier. */
export function recipeCandidates(save: SaveData): { recipe: RecipeDef; tier: number }[] {
  const tier = highestUnlockedTier(save);
  return recipes
    .filter((recipe) => {
      if (isKnown(save, recipe) || recipe.unlockedByDefault || recipe.availableFromTier !== undefined) return false;
      // Forge recipes sell by their gear's tier; a Provisions recipe is tier 1.
      const recipeTier = recipe.station === 'forge' ? forgedItem(recipe)?.tier : 1;
      return recipeTier !== undefined && recipeTier <= tier;
    })
    .map((recipe) => ({ recipe, tier: recipe.station === 'forge' ? forgedItem(recipe)!.tier : 1 }));
}

/** The recipe line a place offers: preferring the given station, falling back to the other. */
export function recipeForSale(save: SaveData, spawn: PlaceSpawn, prefer: 'forge' | 'provisions'): StockLine | null {
  const candidates = recipeCandidates(save).sort((a, b) => a.recipe.id.localeCompare(b.recipe.id));
  const pick = candidates.filter((c) => c.recipe.station === prefer);
  const pool = pick.length > 0 ? pick : candidates;
  if (pool.length === 0) return null;
  const rng = createRng(`recipe|${spawn.id}`);
  const chosen = pool[rng.int(0, pool.length - 1)];
  return { key: `recipe:${chosen.recipe.id}`, kind: 'recipe', id: chosen.recipe.id, amount: 1, price: shopRules.recipePrice[chosen.tier - 1] };
}

/** Forge recipes whose gear is within the player's tier and usable by at least one roster hero: what smithies sell and places pay out. */
export function gearPool(save: SaveData): RecipeDef[] {
  const tier = highestUnlockedTier(save);
  return recipes.filter((recipe) => {
    const item = forgedItem(recipe);
    return item !== null && item.tier <= tier && save.heroes.some((hero) => affinityOf(hero.classId, item.gearType) !== 'unfit');
  });
}

/** The healing potion a shop sells: the strongest the player can brew, sometimes the one below. */
export function potionForSale(save: SaveData, rng: Rng): string {
  const { ladder, weakerChance } = shopRules.potions;
  const strongest = ladder.reduce((best, id, i) => (isKnown(save, recipeById[id]) ? i : best), 0);
  return ladder[Math.max(0, strongest - (rng.chance(weakerChance) ? 1 : 0))];
}

/** A stocked item id, with a healing potion swapped for the player's tier. */
const stockedId = (save: SaveData, id: string, rng: Rng) => (shopRules.potions.ladder.includes(id) ? potionForSale(save, rng) : id);

/** Draw `count` items without repeat, with the rng. */
function draw<T>(pool: T[], count: number, rng: Rng): T[] {
  const rest = [...pool];
  return Array.from({ length: Math.min(count, rest.length) }, () => rest.splice(rng.int(0, rest.length - 1), 1)[0]);
}

/**
 * A place's stock: deterministic from its spawn id and the player's state, so
 * the same place shows the same wares until it moves.
 */
export function placeStock(save: SaveData, spawn: PlaceSpawn): StockLine[] {
  const rng = createRng(`stock|${spawn.id}`);
  const stocked = (): StockLine[] => {
    const stock = shopStock[spawn.kind];
    if (stock) {
      return stock.map((line) => {
        const id = line.pool ? line.pool[rng.int(0, line.pool.length - 1)] : stockedId(save, line.id!, rng);
        const amount = rng.int(line.amount[0], line.amount[1]);
        const price = line.kind === 'material' ? materialPrices[id] : itemPrices[id];
        return { key: `${line.kind}:${id}`, kind: line.kind, id, amount, price };
      });
    }
    if (spawn.kind === 'smithy') {
      const pool = gearPool(save);
      const count = rng.int(shopRules.smithy.gearLines[0], shopRules.smithy.gearLines[1]);
      const recipe = recipeForSale(save, spawn, 'forge');
      return [
        ...draw(pool, count, rng).map((recipe, i) => {
          const item = forgedItem(recipe)!;
          const quality: Quality = rng.chance(shopRules.smithy.rareChance) ? 'rare' : 'normal';
          return {
            key: `gear:${item.id}`,
            kind: 'gear' as const,
            id: item.id,
            amount: 1,
            price: gearPrice(item, quality),
            gear: { uid: `shop:${spawn.id}:${i}`, itemId: item.id, quality, roll: 1 },
          };
        }),
        ...(recipe ? [recipe] : []),
      ];
    }
    if (spawn.kind === 'library') {
      const recipe = recipeForSale(save, spawn, 'provisions');
      return recipe ? [recipe] : [];
    }
    if (spawn.kind === 'market') {
      const pool = marketPool.filter((entry) => entry.kind !== 'material' || (oreTier[entry.id] ?? 0) <= pickaxeTier(save));
      return draw(pool, shopRules.market.lines, rng).map((entry) => {
        const id = entry.kind === 'item' ? stockedId(save, entry.id, rng) : entry.id;
        const price = entry.kind === 'material' ? materialPrices[id] : itemPrices[id];
        return { key: `${entry.kind}:${id}`, kind: entry.kind, id, amount: rng.int(...shopRules.market.amount), price };
      });
    }
    return [];
  };
  // Boss weakness items for bosses within the player's reach, one per place; drawn
  // without the rng so the normal stock stays exactly what it was.
  const weaknesses = bossWeaknesses
    .filter((w) => w.place === spawn.kind)
    .filter((w) => (dungeons.find((d) => d.boss.id === w.bossId)?.tier ?? Infinity) <= highestUnlockedTier(save))
    .map((w) => ({ key: `item:${w.itemId}`, kind: 'item' as const, id: w.itemId, amount: 1, price: w.price }));
  return [...stocked(), ...weaknesses];
}

/** How many of a line are still on the shelf, after this player's purchases. */
export function stockLeft(save: SaveData, spawn: PlaceSpawn, line: StockLine) {
  return line.amount - (save.placePurchases[spawn.id]?.bought[line.key] ?? 0);
}

/** Whether every line of the place has been bought out; weakness lines never sell a place out. */
export function isSoldOut(save: SaveData, spawn: PlaceSpawn, now: number) {
  const lines = placeStock(save, spawn).filter((line) => !(line.id in weaknessByItem));
  if (lines.length === 0) return false;
  const bought = save.placePurchases[spawn.id];
  const counts = bought && bought.expiresAt > now ? bought.bought : {};
  return lines.every((line) => line.amount - (counts[line.key] ?? 0) <= 0);
}

export type BuyProblem = 'gone' | 'tooFar' | 'locked' | 'soldOut' | 'gold' | 'known';

export function buyProblem(
  save: SaveData,
  spawn: PlaceSpawn,
  lineKey: string,
  count: number,
  player: LatLng,
  now: number,
): BuyProblem | null {
  if (spawn.expiresAt <= now || spawn.id in save.usedPlaces) return 'gone';
  // A recipe already learned drops out of the stock, so it is checked from the key.
  if (lineKey.startsWith('recipe:') && isKnown(save, recipeById[lineKey.slice('recipe:'.length)])) return 'known';
  const line = placeStock(save, spawn).find((l) => l.key === lineKey);
  if (!line) return 'gone';
  if (distanceMeters(player, spawn.position) > placeRules.interactionMeters) return 'tooFar';
  if (isLockedMine(spawn.kind, pickaxeTier(save))) return 'locked';
  if (stockLeft(save, spawn, line) < count) return 'soldOut';
  if (save.gold < line.price * count) return 'gold';
  return null;
}

/** Buys `count` of a stock line: pays gold and hands over the goods. */
export function buy(save: SaveData, spawn: PlaceSpawn, lineKey: string, count: number, player: LatLng, now: number): SaveData {
  const problem = buyProblem(save, spawn, lineKey, count, player, now);
  if (problem) throw new Error(`Cannot buy ${lineKey}: ${problem}`);
  const line = placeStock(save, spawn).find((l) => l.key === lineKey)!;

  let next: SaveData = { ...save, gold: save.gold - line.price * count };
  if (line.kind === 'material') {
    next = { ...next, materials: addMaterials(next.materials, [{ materialId: line.id, amount: count }]) };
  } else if (line.kind === 'item') {
    next = { ...next, consumables: { ...next.consumables, [line.id]: (next.consumables[line.id] ?? 0) + count } };
  } else if (line.kind === 'gear') {
    const uid = `g${next.nextUid}`;
    next = { ...next, gear: [...next.gear, { ...line.gear!, uid }], nextUid: next.nextUid + 1 };
  } else {
    next = unlockRecipe(next, line.id);
  }

  const bought = next.placePurchases[spawn.id]?.bought ?? {};
  next = {
    ...next,
    placePurchases: {
      ...next.placePurchases,
      [spawn.id]: { expiresAt: spawn.expiresAt, bought: { ...bought, [lineKey]: (bought[lineKey] ?? 0) + count } },
    },
  };
  if (isSoldOut(next, spawn, now)) next = { ...next, usedPlaces: { ...next.usedPlaces, [spawn.id]: spawn.expiresAt } };
  return next;
}

/** What a smithy pays for a piece: the buy price's sell share, rounded. */
export const gearSellPrice = (gear: GearInstance) => {
  return Math.round(gearPrice(itemById[gear.itemId] as GearDef, gear.quality) * shopRules.gearSellShare);
};

export type SellGearProblem = 'gone' | 'tooFar' | 'notSmithy' | 'worn' | 'missing';

export function sellGearProblem(
  save: SaveData,
  spawn: PlaceSpawn,
  gearUid: string,
  player: LatLng,
  now: number,
): SellGearProblem | null {
  if (spawn.expiresAt <= now || spawn.id in save.usedPlaces) return 'gone';
  if (distanceMeters(player, spawn.position) > placeRules.interactionMeters) return 'tooFar';
  if (spawn.kind !== 'smithy') return 'notSmithy';
  if (!save.gear.some((g) => g.uid === gearUid)) return 'missing';
  if (wornBy(save, gearUid)) return 'worn';
  return null;
}

/** Sells a gear piece to the smithy: removes it and pays the share. */
export function sellGear(save: SaveData, spawn: PlaceSpawn, gearUid: string, player: LatLng, now: number): SaveData {
  const problem = sellGearProblem(save, spawn, gearUid, player, now);
  if (problem) throw new Error(`Cannot sell ${gearUid}: ${problem}`);
  const gear = save.gear.find((g) => g.uid === gearUid)!;
  return { ...save, gold: save.gold + gearSellPrice(gear), gear: save.gear.filter((g) => g.uid !== gearUid) };
}

/** The market's price per material unit; 0 when the market doesn't trade it. */
export function materialSellPrice(materialId: string) {
  const price = materialPrices[materialId];
  return price === undefined ? 0 : Math.max(1, Math.floor(price * shopRules.materialSellShare));
}

export type SellMaterialProblem = 'gone' | 'tooFar' | 'notMarket' | 'unsellable' | 'notEnough';

export function sellMaterialProblem(
  save: SaveData,
  spawn: PlaceSpawn,
  materialId: string,
  count: number,
  player: LatLng,
  now: number,
): SellMaterialProblem | null {
  if (spawn.expiresAt <= now || spawn.id in save.usedPlaces) return 'gone';
  if (distanceMeters(player, spawn.position) > placeRules.interactionMeters) return 'tooFar';
  if (spawn.kind !== 'market') return 'notMarket';
  if (materialSellPrice(materialId) === 0) return 'unsellable';
  if ((save.materials[materialId] ?? 0) < count) return 'notEnough';
  return null;
}

/** Sells surplus materials to the market: removes them and pays the share. */
export function sellMaterial(save: SaveData, spawn: PlaceSpawn, materialId: string, count: number, player: LatLng, now: number): SaveData {
  const problem = sellMaterialProblem(save, spawn, materialId, count, player, now);
  if (problem) throw new Error(`Cannot sell ${materialId}: ${problem}`);
  return {
    ...save,
    gold: save.gold + materialSellPrice(materialId) * count,
    materials: removeMaterials(save.materials, [{ materialId, amount: count }]),
  };
}

export type SellValuableProblem = 'gone' | 'tooFar' | 'notBuyer' | 'notEnough';

export function sellValuableProblem(
  save: SaveData,
  spawn: PlaceSpawn,
  key: string,
  count: number,
  player: LatLng,
  now: number,
): SellValuableProblem | null {
  if (spawn.expiresAt <= now || spawn.id in save.usedPlaces) return 'gone';
  if (distanceMeters(player, spawn.position) > placeRules.interactionMeters) return 'tooFar';
  if (!(lootConfig.valuables.buyers as readonly string[]).includes(spawn.kind)) return 'notBuyer';
  if ((save.valuables[key] ?? 0) < count) return 'notEnough';
  return null;
}

/** What this place pays per unit of the `valuableId:tier` key; the market uses today's collector. */
export function placeValuablePrice(save: SaveData, spawn: PlaceSpawn, key: string, now: number) {
  const separator = key.lastIndexOf(':');
  return valuableSellPrice(
    key.slice(0, separator),
    Number(key.slice(separator + 1)),
    spawn.kind as ValuableBuyer,
    spawn.kind === 'market' ? todaysCollector(save, spawn.id, now) : null,
  );
}

/** Sells a valuable stack to a buyer: removes it and pays the price. */
export function sellValuable(save: SaveData, spawn: PlaceSpawn, key: string, count: number, player: LatLng, now: number): SaveData {
  const problem = sellValuableProblem(save, spawn, key, count, player, now);
  if (problem) throw new Error(`Cannot sell ${key}: ${problem}`);
  const valuables = { ...save.valuables };
  const left = (valuables[key] ?? 0) - count;
  if (left > 0) valuables[key] = left;
  else delete valuables[key];
  return { ...save, gold: save.gold + placeValuablePrice(save, spawn, key, now) * count, valuables };
}
