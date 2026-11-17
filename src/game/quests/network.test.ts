import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import type { PlaceSpawn } from '../places/generate';
import { createInitialSave, type SaveData } from '../save';
import { build } from '../supply/buildings';
import { discoverAt } from '../supply/discovery';
import { deliverGoods, makeOrder } from '../supply/orders';
import { newQuest } from './arrival';
import { passRoute } from './progress';
import type { Quest } from './types';
import { availableObjectives } from './unlocks';
import { createRng } from '../generation/rng';

const HOUR = 3_600_000;
const now = Date.UTC(2026, 10, 2, 12);
const origin = { latitude: -41.2865, longitude: 174.7762 };

const spawnOf = (kind: PlaceSpawn['kind'], id: string, position = origin): PlaceSpawn => ({
  id,
  kind,
  group: kind,
  tile: 't',
  position,
  startsAt: now - HOUR,
  expiresAt: now + 6 * 24 * HOUR,
  roll: 0.5,
});

/** A save with the network ready: tutorial done, tier 2 reached, a hall at the origin and gold to build. */
const ready = (): SaveData => {
  const base = createInitialSave('seed');
  return {
    ...base,
    gold: 500,
    materials: { ...base.materials, wood: 50 },
    tutorial: { ...base.tutorial, step: 'done' },
    clearedDungeons: ['banditStockade'],
    supply: { ...base.supply, hall: { cell: cellAt(origin), moves: [] }, debugUnlocked: true },
  };
};

/** The save holding one quest of the objective, arrived at `now` (network quests count from arrival). */
const withQuest = (save: SaveData, objective: Quest['objective'], band: Quest['band'] = 'medium'): SaveData => {
  const quest = newQuest('q1', band as 'short' | 'medium' | 'long', objective as never, save, createRng('q1'), now);
  return { ...save, quests: { ...save.quests, list: [{ ...quest, acceptedAt: now }] } };
};
const quest = (save: SaveData) => save.quests.list[0];

describe('network quests: when they are offered', () => {
  it('rolls none without the network, and its own once it is open', () => {
    const save = ready();
    const network = ['discover', 'build', 'orderStep', 'supply', 'rideRoute'];
    expect(availableObjectives(save, 'medium', false).some((o) => network.includes(o))).toBe(false);
    const open = availableObjectives(save, 'medium', true);
    for (const o of ['discover', 'build', 'orderStep', 'supply']) expect(open).toContain(o);
    // Build is short or medium only, and Ride the route long only with two stops on the route.
    expect(availableObjectives(save, 'long', true)).not.toContain('build');
    expect(availableObjectives(save, 'long', true)).not.toContain('rideRoute');
  });

  it('offers Ride the route once the cart’s route has two stops', () => {
    const save = ready();
    const route = [
      { place: 'p1', position: offsetPosition(origin, 300, 0) },
      { place: 'p2', position: offsetPosition(origin, 300, 90) },
    ];
    const routed = { ...save, supply: { ...save.supply, cart: { ...save.supply.cart, route } } };
    expect(availableObjectives(routed, 'long', true)).toContain('rideRoute');
    const ride = quest(withQuest(routed, 'rideRoute', 'long'));
    expect(ride.route!.stops.map((stop) => stop.id)).toEqual(['p1', 'p2']);
    expect(ride.amount).toBe(3);
  });

  it('gives a Supply quest a good the open buildings make, and the kind of place it goes to', () => {
    const supply = quest(withQuest(ready(), 'supply'));
    expect(supply.amount).toBe(20);
    expect(supply.itemId).toBeDefined();
    expect(['tavern', 'smithy', 'apothecary', 'market']).toContain(supply.placeKind);
  });
});

describe('network quests: what counts', () => {
  it('counts discoveries', () => {
    const save = withQuest(ready(), 'discover');
    const next = discoverAt(save, [spawnOf('tavern', 'place:tavern:t:0:1'), spawnOf('site', 'place:site:t:0:1')], origin, now).save;
    expect(quest(next).doneAt).toBe(now);
  });

  it('counts a building raised on a site', () => {
    const site = spawnOf('site', 'place:site:t:0:1');
    let save = withQuest(ready(), 'build');
    save = { ...save, supply: { ...save.supply, discovered: { [site.id]: site.expiresAt } } };
    expect(quest(build(save, site, 'farm', origin, now)).doneAt).toBe(now);
  });

  it('counts only the good and kind of place a Supply quest names, and an order step reached', () => {
    const tavern = spawnOf('tavern', 't1');
    let save = withQuest(ready(), 'supply', 'short');
    save = { ...save, quests: { ...save.quests, list: [{ ...quest(save), itemId: 'grain', placeKind: 'tavern', amount: 10 }] } };
    save = { ...save, supply: { ...save.supply, orders: { t1: makeOrder(save, tavern, now) } } };
    const wrongGood = deliverGoods(save, 't1', { meat: 5 }, now).save;
    expect(quest(wrongGood).progress).toBe(0);
    const right = deliverGoods(save, 't1', { grain: 10 }, now).save;
    expect(quest(right).doneAt).toBe(now);

    let stepSave = withQuest(ready(), 'orderStep');
    stepSave = { ...stepSave, supply: { ...stepSave.supply, orders: { t1: makeOrder(stepSave, tavern, now) } } };
    const order = stepSave.supply.orders.t1;
    const quarter = Math.ceil(order.total * 0.25);
    expect(quest(deliverGoods(stepSave, 't1', { grain: quarter }, now).save).doneAt).toBe(now);
  });

  it('walks Ride the route on: every stop in any order, a stop that left counts, then the hall', () => {
    const a = offsetPosition(origin, 300, 0);
    const b = offsetPosition(origin, 300, 90);
    const base = ready();
    const orders = { p1: makeOrder(base, spawnOf('tavern', 'p1', a), now), p2: makeOrder(base, spawnOf('smithy', 'p2', b), now) };
    let save: SaveData = {
      ...base,
      supply: { ...base.supply, orders, cart: { ...base.supply.cart, route: [{ place: 'p1', position: a }, { place: 'p2', position: b }] } },
    };
    save = withQuest(save, 'rideRoute', 'long');
    const hall = tileCenter(save.supply.hall!.cell);
    save = passRoute(save, b, hall, now);
    expect(quest(save).progress).toBe(1);
    // Back at the hall before every stop: not yet.
    save = passRoute(save, hall, hall, now);
    expect(quest(save).doneAt).toBeNull();
    // The first stop's place leaves: it counts as passed, and the hall finishes the quest.
    const { p1: _gone, ...left } = save.supply.orders;
    save = { ...save, supply: { ...save.supply, orders: left } };
    save = passRoute(save, hall, hall, now);
    expect(quest(save).doneAt).toBe(now);
  });
});
