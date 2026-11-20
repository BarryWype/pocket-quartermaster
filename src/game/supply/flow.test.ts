import { emptyLoot } from '../loot/types';
import { createInitialSave, type SaveData } from '../save';
import { flowModel } from './flow';
import type { Order } from './orders';
import type { Building } from './types';

const HOUR = 3_600_000;
const now = 1_800_000_000_000;
const origin = { latitude: -41.2865, longitude: 174.7762 };

const building = (id: string, kind: Building['kind'], hoursLeft = 100): Building => ({
  id,
  kind,
  siteId: `s-${id}`,
  position: origin,
  quality: 2,
  builtAt: now - HOUR,
  expiresAt: now + hoursLeft * HOUR,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
});

const order = (placeId: string, wants: Record<string, number> | null, hoursLeft = 100, delivered: Record<string, number> = {}): Order => ({
  placeId,
  kind: wants === null ? 'market' : 'tavern',
  wants,
  total: 10,
  delivered,
  goldFraction: 0,
  goldPaid: 0,
  steps: [0.25, 0.5, 1].map((at) => ({ at, reward: emptyLoot(), claimed: false })),
  headline: emptyLoot(),
  expiresAt: now + hoursLeft * HOUR,
});

const saveWith = (buildings: Building[], orders: Order[], route: SaveData['supply']['cart']['route']): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    supply: {
      ...base.supply,
      buildings,
      orders: Object.fromEntries(orders.map((entry) => [entry.placeId, entry])),
      cart: { ...base.supply.cart, route },
    },
  };
};

describe('the flow picture’s model', () => {
  it('joins a building to the places that want what it makes: carried when the route holds both, possible otherwise', () => {
    const save = saveWith(
      [building('farm', 'farm'), building('quarry', 'quarry')],
      [order('tavern', { grain: 10 }), order('smithy', { stone: 10 })],
      [{ building: 'farm' }, { place: 'tavern', position: origin }],
    );
    expect(flowModel(save, now).links).toEqual([
      { building: 'farm', place: 'tavern', kind: 'carried' },
      { building: 'quarry', place: 'smithy', kind: 'possible' },
    ]);
  });

  it('a market wants anything; a filled order and a gone one get no line', () => {
    const save = saveWith(
      [building('farm', 'farm')],
      [order('market', null), order('full', { grain: 10 }, 100, { grain: 10 }), order('gone', { grain: 10 }, -1)],
      [],
    );
    const model = flowModel(save, now);
    expect(model.links).toEqual([{ building: 'farm', place: 'market', kind: 'possible' }]);
    expect(model.places.map((entry) => entry.placeId)).toEqual(expect.arrayContaining(['market', 'full']));
    expect(model.places.map((entry) => entry.placeId)).not.toContain('gone');
  });

  it('lists anything in its last day first', () => {
    const save = saveWith([building('a', 'farm', 100), building('b', 'farm', 5)], [order('x', { grain: 1 }, 100), order('y', { grain: 1 }, 5)], []);
    const model = flowModel(save, now);
    expect(model.buildings.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(model.places.map((entry) => entry.placeId)).toEqual(['y', 'x']);
  });
});
