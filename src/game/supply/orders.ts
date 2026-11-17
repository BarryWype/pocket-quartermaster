import { gearId, gearProfiles } from '@/content/equipment';
import { itemById, recipeById } from '@/content/lookup';
import { placeInfo, placeRules } from '@/content/places';
import { recipes } from '@/content/recipes';
import { materialPrices, shopRules } from '@/content/shops';
import { networkGoods, ORDER_KINDS, supplyRules, type OrderKind } from '@/content/supplyLines';

import { isKnown } from '../crafting/crafting';
import { highestUnlockedTier } from '../dungeons/unlock';
import { distanceMeters } from '../generation/geo';
import { createRng, type Rng } from '../generation/rng';
import { removeMaterials } from '../inventory';
import { grantLoot } from '../loot/grant';
import { mergeLoot } from '../loot/roll';
import { emptyLoot, type Loot } from '../loot/types';
import type { PlaceSpawn } from '../places/generate';
import type { SaveData } from '../save';
import { affinityOf } from '../team/team';
import type { GearType, ProvisionDef } from '../types';
import type { BuildingKind } from './types';
import { tr } from '@/i18n';

export type { OrderKind };
export { ORDER_KINDS };

export type OrderStep = { at: number; reward: Loot; claimed: boolean };
export type Order = {
  placeId: string;
  kind: OrderKind;
  /** Goods and amounts wanted; null for a market, which takes any network good. */
  wants: Record<string, number> | null;
  total: number;
  delivered: Record<string, number>;
  /** Gold owed below one whole coin. */
  goldFraction: number;
  goldPaid: number;
  steps: OrderStep[];
  headline: Loot;
  expiresAt: number;
};

export const isOrderKind = (kind: PlaceSpawn['kind']): kind is OrderKind =>
  (ORDER_KINDS as string[]).includes(kind);

/** The base rate of the building kind that serves a place kind; a market is served like a tavern, by the farm. */
const servingRate = (kind: OrderKind) => {
  const kinds = supplyRules.buildings.kinds;
  const building = (Object.keys(kinds) as BuildingKind[]).find((b) => kinds[b].for === kind) ?? 'farm';
  return kinds[building].baseRate;
};

const goldLoot = (gold: number): Loot => {
  const loot = emptyLoot();
  if (gold > 0) {
    loot.gold = gold;
    loot.dropped.push('gold');
  }
  return loot;
};

/** The best healing potion the player can brew: the top of the shop's ladder they know the recipe of. */
const bestBrewablePotion = (save: SaveData) => {
  const { ladder } = shopRules.potions;
  const strongest = ladder.reduce((best, id, i) => (isKnown(save, recipeById[id]) ? i : best), 0);
  return ladder[strongest];
};

/** The meals the player can cook: known kitchen recipes whose output is a meal; every kitchen meal while none is known. */
const cookableMeals = (save: SaveData) => {
  const meals = kitchenMeals(recipes.filter((recipe) => isKnown(save, recipe)));
  return meals.length > 0 ? meals : kitchenMeals(recipes);
};

const kitchenMeals = (list: typeof recipes) =>
  list
    .filter((recipe) => recipe.tab === 'kitchen')
    .map((recipe) => recipe.output)
    .flatMap((output) => {
      const item = 'itemId' in output ? (itemById[output.itemId] as ProvisionDef | undefined) : undefined;
      return item?.meal ? [item.id] : [];
    });

/** The smithy's 50% step: the ore of the player's tier — stone at 1, copper 2, iron 3, coal at 4 and 5. */
const tierOre = (tier: number) => {
  const oreOf: Record<string, string> = { quarry: 'stone', copperMine: 'copper', ironMine: 'iron', coalPit: 'coal' };
  const mines = Object.entries(placeRules.mineTiers) as [string, number][];
  const [kind] = mines.filter(([, mineTier]) => mineTier <= tier).sort((a, b) => b[1] - a[1])[0] ?? mines[0];
  return oreOf[kind];
};

/** A headline before it becomes loot: an item, or a gear type rolled at the player's tier. */
type HeadlinePick = { kind: 'item'; itemId: string } | { kind: 'gear'; gearType: GearType };
const headlineKey = (pick: HeadlinePick) => (pick.kind === 'item' ? pick.itemId : pick.gearType);

const headlineLoot = (pick: HeadlinePick, tier: number): Loot => {
  const loot = emptyLoot();
  if (pick.kind === 'item') {
    loot.consumables.push({ itemId: pick.itemId, amount: 1 });
    loot.dropped.push('consumables');
  } else {
    loot.gear.push({ uid: '', itemId: gearId(pick.gearType, tier), rarity: 'rare' });
    loot.dropped.push('gear');
  }
  return loot;
};

/** The gear types at least one roster hero can wear, in profile order. */
const wearableTypes = (save: SaveData): GearType[] =>
  (Object.keys(gearProfiles) as GearType[]).filter((type) =>
    save.heroes.some((hero) => affinityOf(hero.classId, type) !== 'unfit'),
  );

/** The gear type of a gear item id, which ends in its tier (`sword2`). */
const gearTypeOf = (itemId: string) => itemId.replace(/\d+$/, '');

/** One headline pick for a kind, avoiding the headlines of the player's other live orders of that kind while the pool has another. */
function pickHeadline(save: SaveData, kind: OrderKind, rng: Rng): HeadlinePick {
  const rules = supplyRules.orders;
  const maker = kind === 'market' ? (['tavern', 'apothecary', 'smithy'] as const)[rng.int(0, 2)] : kind;
  const pool: HeadlinePick[] =
    maker === 'tavern'
      ? rules.headlines.tavern.map((itemId) => ({ kind: 'item' as const, itemId }))
      : maker === 'apothecary'
        ? rng.chance(rules.flaskChance)
          ? [{ kind: 'gear' as const, gearType: 'flasks' as GearType }]
          : rules.headlines.apothecary.map((itemId) => ({ kind: 'item' as const, itemId }))
        : wearableTypes(save).map((gearType) => ({ kind: 'gear' as const, gearType }));
  const taken = new Set(
    Object.values(save.supply.orders)
      .filter((order) => order.kind === kind)
      .flatMap((order) => {
        const [consumable] = order.headline.consumables;
        const [gear] = order.headline.gear;
        return [consumable ? consumable.itemId : gear ? gearTypeOf(gear.itemId) : ''];
      }),
  );
  const fresh = pool.filter((pick) => !taken.has(headlineKey(pick)));
  const left = fresh.length > 0 ? fresh : pool;
  return left[rng.int(0, left.length - 1)];
}

/**
 * The order a place holds, made once at discovery: seeded from the place and
 * the player, sized for one average building, its steps' rewards fixed at the
 * player's tier when it is made.
 */
export function makeOrder(save: SaveData, place: PlaceSpawn, now: number): Order {
  const rules = supplyRules.orders;
  const rng = createRng(`order|${place.id}|${save.playerSeed}`);
  const kind = place.kind as OrderKind;
  const tier = highestUnlockedTier(save);
  const middle = rules.averageQuality * rules.rateShare * rules.fillHours * servingRate(kind);
  const total = Math.round(middle * (1 + (rng.next() * 2 - 1) * rules.spread));
  const rule = rules.kinds[kind];
  const wants =
    rule.any || !rule.wants
      ? null
      : Object.fromEntries(Object.entries(rule.wants).map(([good, share]) => [good, Math.max(1, Math.round(total * share))]));
  const multiplier = rules.tierGold[tier - 1];
  const [gold25, gold50, gold100] = rules.rewards.gold[kind];
  const steps: OrderStep[] = rules.steps.map((at, i): OrderStep => {
    const gold = [gold25, gold50, gold100][i];
    if (gold > 0) return { at, reward: goldLoot(gold * multiplier), claimed: false };
    const loot = emptyLoot();
    if (kind === 'smithy') {
      loot.materials.push({ materialId: tierOre(tier), amount: rules.rewards.ore });
      loot.dropped.push('materials');
    } else if (kind === 'apothecary') {
      loot.consumables.push({ itemId: bestBrewablePotion(save), amount: rules.rewards.potions });
      loot.dropped.push('consumables');
    } else {
      const meals = cookableMeals(save);
      loot.consumables.push({ itemId: meals[rng.int(0, meals.length - 1)], amount: rules.rewards.meals });
      loot.dropped.push('consumables');
    }
    return { at, reward: loot, claimed: false };
  });
  return {
    placeId: place.id,
    kind,
    wants,
    total,
    delivered: {},
    goldFraction: 0,
    goldPaid: 0,
    steps,
    headline: headlineLoot(pickHeadline(save, kind, rng), tier),
    expiresAt: place.expiresAt,
  };
}

/** How much of the order is delivered, 0 to 1. */
export const orderProgress = (order: Order) =>
  Math.min(1, Object.values(order.delivered).reduce((sum, amount) => sum + amount, 0) / order.total);

const deliveredTotal = (order: Order) => Object.values(order.delivered).reduce((sum, amount) => sum + amount, 0);

/** What each good still takes: a market takes any network good, up to the total left. */
export function stillNeeded(order: Order): Record<string, number> {
  if (order.wants === null) {
    const left = order.total - deliveredTotal(order);
    return Object.fromEntries(networkGoods.map((good) => [good, left]));
  }
  return Object.fromEntries(Object.entries(order.wants).map(([good, amount]) => [good, amount - (order.delivered[good] ?? 0)]));
}

/** The step indices the delivered amount has reached. */
export const reachedSteps = (order: Order) =>
  order.steps.flatMap((step, i) => (orderProgress(order) >= step.at ? [i] : []));

export type DeliverProblem = 'unknown' | 'notHere' | 'filled' | 'nothingToGive';

/** What blocks a delivery, or null when the player can hand goods over here. */
export function deliverProblem(
  save: SaveData,
  placeId: string,
  placePosition: { latitude: number; longitude: number },
  player: { latitude: number; longitude: number },
): DeliverProblem | null {
  const order = save.supply.orders[placeId];
  if (!order) return 'unknown';
  if (distanceMeters(player, placePosition) > placeRules.interactionMeters) return 'notHere';
  if (orderProgress(order) >= 1) return 'filled';
  const needed = stillNeeded(order);
  const held = Object.keys(needed).some((good) => needed[good] > 0 && (save.materials[good] ?? 0) > 0);
  return held ? null : 'nothingToGive';
}

/**
 * The core of a delivery, from the bag or the cart: what the order still
 * takes of the goods at hand (a market: any network good, largest stack
 * first), the gold it pays for them with the fraction carried, and the save
 * with that gold paid and the order updated. The caller takes the goods out
 * of wherever they came from. Pure: returns a new save.
 */
export function deliverGoods(
  save: SaveData,
  placeId: string,
  goods: Record<string, number>,
  now: number,
): { save: SaveData; taken: Record<string, number>; gold: number } {
  const order = save.supply.orders[placeId];
  if (!order) throw new Error(`Cannot deliver to ${placeId}: unknown`);
  const needed = stillNeeded(order);
  const list =
    order.wants === null
      ? [...networkGoods].sort((a, b) => (goods[b] ?? 0) - (goods[a] ?? 0))
      : Object.keys(order.wants);
  const taken: Record<string, number> = {};
  let fraction = order.goldFraction;
  let left = order.total - deliveredTotal(order);
  for (const good of list) {
    const take = Math.min(order.wants === null ? left : needed[good], goods[good] ?? 0);
    if (take <= 0) continue;
    taken[good] = take;
    left -= take;
    fraction += take * supplyRules.orders.goldPerUnitShare * materialPrices[good];
  }
  const gold = Math.floor(fraction);
  const orders = {
    ...save.supply.orders,
    [placeId]: {
      ...order,
      delivered: {
        ...order.delivered,
        ...Object.fromEntries(Object.entries(taken).map(([good, amount]) => [good, (order.delivered[good] ?? 0) + amount])),
      },
      goldFraction: fraction - gold,
      goldPaid: order.goldPaid + gold,
    },
  };
  return {
    save: { ...save, gold: save.gold + gold, supply: { ...save.supply, orders } },
    taken,
    gold,
  };
}

/**
 * Hands over every wanted good the player holds, up to what the order still
 * takes (a market: any network good, largest stack first), paying the order's
 * gold per unit with the fraction carried. Pure: returns a new save.
 */
export function deliverFromBag(
  save: SaveData,
  placeId: string,
  placePosition: { latitude: number; longitude: number },
  player: { latitude: number; longitude: number },
  now: number,
): { save: SaveData; delivered: Record<string, number>; gold: number } {
  const problem = deliverProblem(save, placeId, placePosition, player);
  if (problem) throw new Error(`Cannot deliver to ${placeId}: ${problem}`);
  const { save: given, taken, gold } = deliverGoods(save, placeId, save.materials, now);
  return {
    save: {
      ...given,
      materials: removeMaterials(given.materials, Object.entries(taken).map(([materialId, amount]) => ({ materialId, amount }))),
    },
    delivered: taken,
    gold,
  };
}

/**
 * Pays a reached, unclaimed step — at 100% the headline too — and marks it
 * claimed. Returns the save and the loot paid, for the loot grid.
 */
export function claimStep(save: SaveData, placeId: string, stepIndex: number, now: number): { save: SaveData; paid: Loot } {
  const order = save.supply.orders[placeId];
  const step = order?.steps[stepIndex];
  if (!order || !step || step.claimed || orderProgress(order) < step.at) {
    throw new Error(`Cannot claim step ${stepIndex} of ${placeId}`);
  }
  let next = grantLoot(save, [], step.reward, now, placeId);
  let paid = step.reward;
  if (step.at === 1) {
    next = grantLoot(next, [], order.headline, now, placeId);
    paid = mergeLoot(paid, order.headline);
  }
  const steps = order.steps.map((s, i) => (i === stepIndex ? { ...s, claimed: true } : s));
  return {
    save: { ...next, supply: { ...next.supply, orders: { ...next.supply.orders, [placeId]: { ...order, steps } } } },
    paid,
  };
}

/**
 * Pays the reached, unclaimed steps of every order whose place has left, and
 * drops the orders. Pure: returns a new save.
 */
export function settleOrders(save: SaveData, now: number): SaveData {
  const expired = Object.values(save.supply.orders).filter((order) => order.expiresAt <= now);
  if (expired.length === 0) return save;
  let next = save;
  const orders = { ...save.supply.orders };
  for (const order of expired) {
    for (const step of order.steps) {
      if (step.claimed || orderProgress(order) < step.at) continue;
      next = grantLoot(next, [], step.reward, now, order.placeId);
      if (step.at === 1) next = grantLoot(next, [], order.headline, now, order.placeId);
    }
    delete orders[order.placeId];
  }
  return { ...next, supply: { ...next.supply, orders } };
}

/** The order's place as a notification names it: a tavern by its name, the rest by their kind. */
export function orderPlaceName(order: Order, tavernName: (placeId: string) => string): string {
  return order.kind === 'tavern' ? tavernName(order.placeId) : tr(placeInfo[order.kind].name);
}
