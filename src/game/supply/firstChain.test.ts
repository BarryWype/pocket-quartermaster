import { supplyRules } from '@/content/supplyLines';

import { emptyLoot } from '../loot/types';
import { createInitialSave, type SaveData } from '../save';
import { emptySupply } from './state';
import type { Building, Cart } from './types';
import type { Order } from './orders';
import { FIRST_CHAIN_STEPS, advanceFirstChain } from './firstChain';

const now = Date.UTC(2026, 10, 2, 12);
const DAY_MS = 24 * 3_600_000;

const farm: Building = {
  id: 'b1',
  kind: 'farm',
  siteId: 'place:site:t:1:1',
  position: { latitude: -41.2865, longitude: 174.7762 },
  quality: 2,
  builtAt: now,
  expiresAt: now + 6 * DAY_MS,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
};

const order = (delivered: Record<string, number>): Order => ({
  placeId: 'place:tavern:t:1:1',
  kind: 'tavern',
  wants: { grain: 10 },
  total: 10,
  delivered,
  goldFraction: 0,
  goldPaid: 0,
  steps: [],
  headline: emptyLoot(),
  expiresAt: now + DAY_MS,
});

/**
 * A save whose first chain has not started, with the first `met` steps'
 * conditions holding: the hall, a discovered site, a farm, a discovered
 * tavern, a route with a building and a place stop, a delivered order.
 */
const chainSave = (met: number): SaveData => {
  const base = createInitialSave();
  const supply = emptySupply(now);
  let cart: Cart = supply.cart;
  if (met > FIRST_CHAIN_STEPS.indexOf('route')) cart = { ...cart, route: [{ building: 'b1' }, { place: 'place:tavern:t:1:1', position: farm.position }] };
  return {
    ...base,
    supply: {
      ...supply,
      hall: met > 0 ? { cell: 'a', moves: [] } : null,
      discovered: {
        ...(met > 1 ? { 'place:site:t:1:1': now + DAY_MS } : {}),
        ...(met > 3 ? { 'place:tavern:t:1:1': now + DAY_MS } : {}),
      },
      buildings: met > 2 ? [farm] : [],
      cart,
      orders: met > 5 ? { 'place:tavern:t:1:1': order({ grain: 1 }) } : {},
    },
  };
};

describe('advanceFirstChain', () => {
  it("changes nothing while the first step's condition does not hold", () => {
    const base = chainSave(0);
    const result = advanceFirstChain(base, now);
    expect(result.save).toBe(base);
    expect(result.finished).toBe(false);
    expect(result.save.supply.firstChain).toEqual({ step: 0, doneAt: null });
  });

  it('advances one step when only the hall is placed', () => {
    const next = advanceFirstChain(chainSave(1), now);
    expect(next.save.supply.firstChain.step).toBe(1);
    expect(next.finished).toBe(false);
  });

  it('stops at the step whose condition does not hold, even when a later one does', () => {
    // A farm stands, the route is set and an order was served, but no site is discovered: the chain waits at the site step.
    const base = chainSave(1);
    const skipped: SaveData = {
      ...base,
      supply: {
        ...base.supply,
        buildings: [farm],
        cart: { ...base.supply.cart, route: [{ building: 'b1' }, { place: 'place:tavern:t:1:1', position: farm.position }] },
        orders: { 'place:tavern:t:1:1': order({ grain: 1 }) },
      },
    };
    expect(advanceFirstChain(skipped, now).save.supply.firstChain.step).toBe(1);
  });

  it('advances several steps at once when their conditions hold together', () => {
    expect(advanceFirstChain(chainSave(2), now).save.supply.firstChain.step).toBe(2);
    expect(advanceFirstChain(chainSave(3), now).save.supply.firstChain.step).toBe(3);
    expect(advanceFirstChain(chainSave(4), now).save.supply.firstChain.step).toBe(4);
    expect(advanceFirstChain(chainSave(5), now).save.supply.firstChain.step).toBe(5);
  });

  it('pays the reward exactly once when the last step is met', () => {
    const before = chainSave(FIRST_CHAIN_STEPS.length);
    const goldBefore = before.gold;
    const done = advanceFirstChain(before, now);
    expect(done.finished).toBe(true);
    expect(done.save.supply.firstChain).toEqual({ step: FIRST_CHAIN_STEPS.length, doneAt: now });
    expect(done.save.gold).toBe(goldBefore + supplyRules.firstChain.rewardGold);
    const again = advanceFirstChain(done.save, now + DAY_MS);
    expect(again.save).toBe(done.save);
    expect(again.finished).toBe(false);
    expect(again.save.gold).toBe(done.save.gold);
  });

  it('never changes a finished chain again', () => {
    const done = advanceFirstChain(chainSave(FIRST_CHAIN_STEPS.length), now).save;
    const undone = { ...done, supply: { ...done.supply, hall: null, buildings: [] } };
    const later = advanceFirstChain(undone, now + DAY_MS);
    expect(later.save).toBe(undone);
    expect(later.finished).toBe(false);
    expect(later.save.supply.firstChain.doneAt).toBe(now);
  });
});
