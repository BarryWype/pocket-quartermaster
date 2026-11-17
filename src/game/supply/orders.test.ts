import { gearProfiles } from '@/content/equipment';
import { dungeons } from '@/content/dungeons';
import { items } from '@/content/items';
import { lootConfig } from '@/content/loot/config';
import { marketPool, materialPrices, shopStock } from '@/content/shops';
import { supplyRules } from '@/content/supplyLines';
import { recipes } from '@/content/recipes';

import { highestUnlockedTier } from '../dungeons/unlock';
import { offsetPosition } from '../generation/geo';
import type { PlaceSpawn } from '../places/generate';
import { createInitialSave, type SaveData } from '../save';
import { claimStep, deliverFromBag, deliverProblem, makeOrder, orderProgress, reachedSteps, settleOrders, stillNeeded } from './orders';

const HOUR = 3_600_000;
const now = Date.UTC(2026, 10, 2, 12);
const origin = { latitude: -41.2865, longitude: 174.7762 };

const spawnOf = (kind: PlaceSpawn['kind'], id: string, expiresAt = now + 6 * 24 * HOUR): PlaceSpawn => ({
  id,
  kind,
  group: kind,
  tile: 't',
  position: origin,
  startsAt: now,
  expiresAt,
  roll: 0,
});

/** A save holding the given orders, keyed by place id. */
const saveWithOrders = (orders: { place: PlaceSpawn; order?: ReturnType<typeof makeOrder> }[]): SaveData => {
  const save = createInitialSave();
  const map: Record<string, ReturnType<typeof makeOrder>> = {};
  for (const { place, order } of orders) map[place.id] = order ?? makeOrder({ ...save, supply: { ...save.supply, orders: map } }, place, now);
  return { ...save, supply: { ...save.supply, orders: map } };
};

const headlineId = (order: ReturnType<typeof makeOrder>) =>
  order.headline.consumables[0]?.itemId ?? order.headline.gear[0]?.itemId ?? '';

describe('order sizing', () => {
  const middle = (kind: PlaceSpawn['kind']) => {
    const kinds = supplyRules.buildings.kinds;
    const building = (Object.keys(kinds) as ('farm' | 'quarry' | 'herbGarden')[]).find((b) => kinds[b].for === kind) ?? 'farm';
    return supplyRules.orders.averageQuality * supplyRules.orders.rateShare * supplyRules.orders.fillHours * kinds[building].baseRate;
  };

  it('sizes each kind from its serving building, within the spread, split over its wants', () => {
    for (const kind of ['tavern', 'smithy', 'apothecary', 'market'] as const) {
      const order = makeOrder(createInitialSave(), spawnOf(kind, 'p1'), now);
      const mid = middle(kind);
      expect(order.total).toBeGreaterThanOrEqual(Math.round(mid * (1 - supplyRules.orders.spread)));
      expect(order.total).toBeLessThanOrEqual(Math.round(mid * (1 + supplyRules.orders.spread)));
      if (kind === 'market') {
        expect(order.wants).toBeNull();
      } else {
        const shares = supplyRules.orders.kinds[kind].wants!;
        expect(Object.keys(order.wants!)).toEqual(Object.keys(shares));
        for (const [good, amount] of Object.entries(order.wants!)) {
          expect([`${kind} ${good}`, amount]).toEqual([`${kind} ${good}`, Math.max(1, Math.round(order.total * shares[good]))]);
        }
      }
      expect(order.expiresAt).toBe(now + 6 * 24 * HOUR);
    }
  });

  it('is seeded from the place and the player', () => {
    const place = spawnOf('tavern', 'p1');
    const save = createInitialSave();
    expect(makeOrder(save, place, now)).toEqual(makeOrder(save, place, now));
    expect(makeOrder({ ...save, playerSeed: 'other' }, place, now).total).not.toBe(makeOrder(save, place, now).total);
  });
});

describe('order rewards', () => {
  it('pays the steps gold before the tier multiplier, and goods at the middle steps', () => {
    const save = createInitialSave();
    const tavern = makeOrder(save, spawnOf('tavern', 'p1'), now);
    const smithy = makeOrder(save, spawnOf('smithy', 'p2'), now);
    const apothecary = makeOrder(save, spawnOf('apothecary', 'p3'), now);
    const market = makeOrder(save, spawnOf('market', 'p4'), now);
    const [t25, t50, t100] = tavern.steps.map((s) => s.reward);
    expect([t25.gold, t50.gold, t100.gold]).toEqual(supplyRules.orders.rewards.gold.tavern);
    expect(t50.consumables[0].amount).toBe(supplyRules.orders.rewards.meals);
    expect(smithy.steps[1].reward.materials).toEqual([{ materialId: 'stone', amount: supplyRules.orders.rewards.ore }]);
    expect(apothecary.steps[1].reward.consumables).toEqual([{ itemId: 'healingPotion', amount: supplyRules.orders.rewards.potions }]);
    expect(market.steps.map((s) => s.reward.gold)).toEqual(supplyRules.orders.rewards.gold.market);
    expect(market.steps[1].reward.consumables).toEqual([]);
  });

  it('scales the step gold with the tier', () => {
    // Beating the tier 1 and 2 bosses opens tier 3, whose multiplier is tierGold[2].
    const bosses = dungeons.filter((d) => d.isBoss && d.tier <= 2).map((d) => d.id);
    const save = { ...createInitialSave(), clearedDungeons: bosses };
    expect(highestUnlockedTier(save)).toBe(3);
    const order = makeOrder(save, spawnOf('market', 'm1'), now);
    expect(order.steps[0].reward.gold).toBe(supplyRules.orders.rewards.gold.market[0] * supplyRules.orders.tierGold[2]);
  });

  it('gives two taverns of one player different headlines while the pool has another', () => {
    const save = saveWithOrders([{ place: spawnOf('tavern', 't1') }, { place: spawnOf('tavern', 't2') }, { place: spawnOf('tavern', 't3') }]);
    const headlines = ['t1', 't2', 't3'].map((id) => headlineId(save.supply.orders[id]));
    expect(new Set(headlines.slice(0, 2)).size).toBe(2);
    expect(supplyRules.orders.headlines.tavern).toContain(headlines[0]);
  });

  it('rolls a smithy headline from gear types the roster can wear, at the player tier', () => {
    const save = saveWithOrders([{ place: spawnOf('smithy', 's1') }]);
    const [piece] = save.supply.orders.s1.headline.gear;
    const type = piece.itemId.replace(/\d+$/, '');
    expect((Object.keys(gearProfiles) as string[])).toContain(type);
    expect(piece.rarity).toBe('rare');
  });
});

describe('delivering', () => {
  const tavernSave = () => saveWithOrders([{ place: spawnOf('tavern', 't1') }]);
  const at = (meters: number) => offsetPosition(origin, meters, 0);

  it('pays the gold per unit with the fraction carried over several deliveries', () => {
    let save = tavernSave();
    const order = save.supply.orders.t1;
    const grainWanted = order.wants!.grain;
    save = { ...save, materials: { ...save.materials, grain: grainWanted } };
    const first = deliverFromBag(save, 't1', origin, origin, now);
    // Every unit pays 1.25 x the shop price; whole gold only, the fraction stays on the order.
    const price = supplyRules.orders.goldPerUnitShare * materialPrices.grain;
    expect(first.delivered).toEqual({ grain: grainWanted });
    expect(first.gold).toBe(Math.floor(grainWanted * price));
    expect(first.save.supply.orders.t1.goldFraction).toBeCloseTo(grainWanted * price - Math.floor(grainWanted * price), 10);
    expect(first.save.gold).toBe(save.gold + first.gold);
    expect(first.save.materials.grain ?? 0).toBe(0);
  });

  it('carries a fraction from one delivery into the next', () => {
    let save = tavernSave();
    save = { ...save, materials: { ...save.materials, grain: 3 } };
    const first = deliverFromBag(save, 't1', origin, origin, now);
    save = first.save;
    const second = deliverFromBag({ ...save, materials: { ...save.materials, grain: 1 } }, 't1', origin, origin, now);
    // 3 units pay 3.75 (3 gold, 0.75 held); the fourth brings the fraction to 2 whole coins.
    expect(first.gold).toBe(3);
    expect(second.gold).toBe(2);
    expect(second.save.supply.orders.t1.goldPaid).toBe(5);
  });

  it('keeps what earlier deliveries brought when a later one brings another good', () => {
    let save = tavernSave();
    save = deliverFromBag({ ...save, materials: { ...save.materials, grain: 5 } }, 't1', origin, origin, now).save;
    save = deliverFromBag({ ...save, materials: { ...save.materials, meat: 2 } }, 't1', origin, origin, now).save;
    expect(save.supply.orders.t1.delivered).toEqual({ grain: 5, meat: 2 });
  });

  it('never takes more than the order still needs', () => {
    let save = saveWithOrders([{ place: spawnOf('smithy', 's1') }]);
    const wanted = save.supply.orders.s1.wants!.stone;
    save = { ...save, materials: { ...save.materials, stone: wanted * 3 } };
    const { save: next, delivered } = deliverFromBag(save, 's1', origin, origin, now);
    expect(delivered).toEqual({ stone: wanted });
    expect(next.materials.stone).toBe(wanted * 2);
    expect(orderProgress(next.supply.orders.s1)).toBe(1);
  });

  it('fills a market from any network good, largest stack first, up to the total', () => {
    let save = saveWithOrders([{ place: spawnOf('market', 'm1') }]);
    const total = save.supply.orders.m1.total;
    save = { ...save, materials: { ...save.materials, grain: 2, mushroom: total } };
    const { save: next, delivered } = deliverFromBag(save, 'm1', origin, origin, now);
    expect(delivered).toEqual({ mushroom: total });
    expect(orderProgress(next.supply.orders.m1)).toBe(1);
  });

  it('refuses what the rules refuse', () => {
    const save = tavernSave();
    expect(deliverProblem(save, 'nope', origin, origin)).toBe('unknown');
    expect(deliverProblem(save, 't1', origin, at(500))).toBe('notHere');
    expect(deliverProblem(save, 't1', origin, origin)).toBe('nothingToGive');
    const filled = deliverFromBag({ ...save, materials: { ...save.materials, grain: save.supply.orders.t1.wants!.grain, meat: save.supply.orders.t1.wants!.meat } }, 't1', origin, origin, now).save;
    expect(deliverProblem(filled, 't1', origin, origin)).toBe('filled');
  });
});

describe('claiming and settling', () => {
  const halfTavern = () => {
    let save = saveWithOrders([{ place: spawnOf('tavern', 't1') }]);
    const order = save.supply.orders.t1;
    save = { ...save, materials: { ...save.materials, grain: Math.ceil(order.wants!.grain / 2) } };
    return deliverFromBag(save, 't1', origin, origin, now).save;
  };

  it('pays a reached step once, and the headline with the 100% step', () => {
    let save = halfTavern();
    expect(reachedSteps(save.supply.orders.t1)).toEqual([0]);
    const { save: claimed, paid } = claimStep(save, 't1', 0, now);
    expect(paid.gold).toBe(supplyRules.orders.rewards.gold.tavern[0] * supplyRules.orders.tierGold[0]);
    expect(claimed.gold).toBe(save.gold + paid.gold);
    expect(claimed.supply.orders.t1.steps[0].claimed).toBe(true);
    expect(() => claimStep(claimed, 't1', 0, now)).toThrow();
    expect(() => claimStep(claimed, 't1', 1, now)).toThrow();

    // Fill it and claim the 100% step: the headline comes with it.
    let full = claimed;
    const order = full.supply.orders.t1;
    const needed = stillNeeded(order);
    full = deliverFromBag({ ...full, materials: { ...full.materials, grain: needed.grain, meat: needed.meat } }, 't1', origin, origin, now).save;
    const last = claimStep(full, 't1', 2, now);
    expect(last.paid.consumables.some((entry) => entry.itemId === headlineId(full.supply.orders.t1))).toBe(true);
    expect(last.save.consumables[headlineId(full.supply.orders.t1)]).toBe(1);
  });

  it('pays the reached steps of an expired order and drops it; the rest is lost', () => {
    const save = halfTavern();
    const settled = settleOrders(save, save.supply.orders.t1.expiresAt);
    expect(settled.supply.orders.t1).toBeUndefined();
    // The 25% step was reached and paid; the 50% and 100% steps were not.
    expect(settled.gold).toBe(save.gold + supplyRules.orders.rewards.gold.tavern[0] * supplyRules.orders.tierGold[0]);
    expect(settled.supply.orders).toEqual({});
    // A live order changes nothing.
    expect(settleOrders(save, now)).toBe(save);
  });
});

describe('order-only items', () => {
  const orderOnlyIds = new Set(items.filter((item) => item.orderOnly).map((item) => item.id));

  it('flags exactly the six headline items', () => {
    expect([...orderOnlyIds].sort()).toEqual(
      [...supplyRules.orders.headlines.tavern, ...supplyRules.orders.headlines.apothecary].sort(),
    );
  });

  it('keeps them out of every recipe, shop stock, market pool and loot pool', () => {
    expect(orderOnlyIds.size).toBeGreaterThan(0);
    for (const recipe of recipes) {
      for (const input of recipe.inputs) expect(orderOnlyIds.has(input.materialId)).toBe(false);
      if ('itemId' in recipe.output) expect(orderOnlyIds.has(recipe.output.itemId)).toBe(false);
    }
    for (const lines of Object.values(shopStock)) {
      for (const line of lines) {
        if (line.id) expect(orderOnlyIds.has(line.id)).toBe(false);
        for (const id of line.pool ?? []) expect(orderOnlyIds.has(id)).toBe(false);
      }
    }
    for (const entry of marketPool) expect(orderOnlyIds.has(entry.id)).toBe(false);
    for (const entry of lootConfig.consumables) expect(orderOnlyIds.has(entry.itemId)).toBe(false);
  });
});
