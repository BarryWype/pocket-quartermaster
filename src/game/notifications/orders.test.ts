import { notificationRules } from '@/content/notifications';
import { supplyRules } from '@/content/supplyLines';

import { createInitialSave, type SaveData } from '../save';
import { makeOrder, type Order } from '../supply/orders';
import { emptySupply } from '../supply/state';
import { defaultNotificationSettings, planNotifications } from './plan';
import type { PlaceSpawn } from '../places/generate';

const HOUR = 3_600_000;
const origin = { latitude: -41.2865, longitude: 174.7762 };
/** Noon: outside the default quiet hours, so delivery times aren't moved. */
const noon = new Date(2026, 10, 16, 12, 0).getTime();

const spawnOf = (kind: PlaceSpawn['kind'], id: string): PlaceSpawn => ({
  id,
  kind,
  group: kind,
  tile: 't',
  position: origin,
  startsAt: noon,
  expiresAt: noon + 2 * 24 * HOUR,
  roll: 0,
});

/** A save whose smithy order is 70% filled, leaving in two days. */
const withOrder = (progress: number): SaveData => {
  const base = createInitialSave();
  const order = makeOrder(base, spawnOf('smithy', 's1'), noon);
  // A round total keeps the percentage exact, whatever the seeded size was.
  const filled: Order = { ...order, total: 100, delivered: { stone: Math.round(100 * progress) } };
  return { ...base, supply: { ...emptySupply(noon), orders: { s1: filled } } };
};

describe('order notifications', () => {
  const ordersOf = (save: SaveData, supplyLines: boolean, on = true) => {
    const settings = defaultNotificationSettings();
    const withCategory = { ...settings, categories: { ...settings.categories, orders: on } };
    return planNotifications(save, withCategory, noon, notificationRules, supplyLines).filter((n) => n.category === 'orders');
  };

  it('is planned the day before the place leaves, naming the place and how full the order is', () => {
    const [order] = ordersOf(withOrder(0.7), true);
    expect(order.at).toBe(noon + 2 * 24 * HOUR - supplyRules.orders.noticeHours * HOUR);
    expect(order.title).toBe('Leaves tomorrow: Smithy');
    expect(order.body).toBe('Its order is 70% filled; steps not reached by then are lost.');
    expect(order.data).toEqual({ route: 'network' });
  });

  it('is not planned below a quarter, once filled, past the notice, or with the switch or category off', () => {
    expect(ordersOf(withOrder(0.1), true)).toEqual([]);
    expect(ordersOf(withOrder(1), true)).toEqual([]);
    expect(ordersOf(withOrder(0.7), false)).toEqual([]);
    expect(ordersOf(withOrder(0.7), true, false)).toEqual([]);
    // The notice time already passed: the place leaves in a few hours.
    const soon = withOrder(0.7);
    const order = soon.supply.orders.s1;
    const leaving = { ...soon, supply: { ...soon.supply, orders: { s1: { ...order, expiresAt: noon + 3 * HOUR } } } };
    expect(ordersOf(leaving, true)).toEqual([]);
  });
});
