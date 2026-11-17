import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { itemById, materialById } from '@/content/lookup';
import { distanceMeters, offsetPosition } from '@/game/generation/geo';
import type { PlaceSpawn } from '@/game/places/generate';
import { createInitialSave, type SaveData } from '@/game/save';
import { makeOrder, orderPlaceName, orderProgress, type Order } from '@/game/supply/orders';
import { tavernNameOf } from '@/game/taverns/taverns';
import { formatDistance, formatPercent, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

import { NetworkTab } from './NetworkTab';
import { OrderSection } from './OrderSection';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
// The library is native-bound; the components only need its map pieces to exist.
jest.mock('@maplibre/maplibre-react-native', () => ({ GeoJSONSource: () => null, Layer: () => null, Marker: () => null }));

const position = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.now();
const DAY = 24 * 3_600_000;

const tavernAt = (id: string, meters: number, daysLeft: number): PlaceSpawn => ({
  id,
  kind: 'tavern',
  group: 'tavern',
  tile: 't',
  position: offsetPosition(position, meters, 0),
  startsAt: 0,
  expiresAt: now + daysLeft * DAY,
  roll: 0,
});

/** A save that has discovered `place` and holds the order it was given at discovery. */
const saveWithOrder = (place: PlaceSpawn, change?: (order: Order) => Order, materials?: Record<string, number>): SaveData => {
  const base = createInitialSave();
  const order = change ? change(makeOrder(base, place, now)) : makeOrder(base, place, now);
  return {
    ...base,
    materials: { ...base.materials, ...materials },
    supply: { ...base.supply, debugUnlocked: true, discovered: { [place.id]: place.expiresAt }, orders: { [place.id]: order } },
  };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, title: string) =>
  renderer.root.findAll((node) => node.props.title === title && typeof node.props.onPress === 'function');

describe('an order on a place sheet', () => {
  beforeEach(() => useSettingsStore.setState({ supplyLines: true }));
  afterEach(() => {
    act(() => renderer?.unmount());
    useSettingsStore.setState({ supplyLines: false });
  });
  let renderer: ReactTestRenderer | null = null;

  it('shows a fresh order: its headline, its wants and the build hint, and deliver disabled with its reason while away', () => {
    const place = tavernAt('p1', 400, 5);
    act(() => {
      useGameStore.setState({ save: saveWithOrder(place) });
    });
    act(() => {
      renderer = create(<OrderSection place={place} player={position} now={now} />);
    });
    const sheet = text(renderer!);
    const order = useGameStore.getState().save.supply.orders[place.id];
    const headlineId = order.headline.consumables[0]?.itemId ?? order.headline.gear[0]?.itemId;
    expect(sheet).toContain(tr(itemById[headlineId!].name));
    expect(sheet).toContain(t('supply.order.onlyHere'));
    expect(sheet).toContain(t('supply.order.forFilling'));
    expect(sheet).toContain(t('supply.order.wants'));
    expect(sheet).toContain(tr(materialById.grain.name));
    expect(sheet).toContain(t('supply.order.buildHint', { good: 'Grain', building: 'Farm' }));
    expect(button(renderer!, t('supply.order.deliver')).every((node) => node.props.disabled)).toBe(true);
    expect(sheet).toContain(
      t('supply.order.walkToDeliver', {
        place: orderPlaceName(order, tavernNameOf),
        distance: formatDistance(distanceMeters(position, place.position)),
      }),
    );
  });

  it('claims the reached step, and previews what a delivery hands over', () => {
    const place = tavernAt('p1', 30, 5);
    act(() => {
      useGameStore.setState({
        save: saveWithOrder(place, (order) => ({ ...order, delivered: { grain: Math.ceil(order.total * 0.3) } }), { grain: 10 }),
      });
    });
    act(() => {
      renderer = create(<OrderSection place={place} player={position} now={now} />);
    });
    const sheet = text(renderer!);
    const order = useGameStore.getState().save.supply.orders[place.id];
    expect(sheet).toContain(formatPercent(orderProgress(order)));
    expect(sheet).toContain(t('supply.order.handsOver'));
    expect(sheet).toContain(t('supply.order.claim', { pct: 25 }));
    act(() => {
      button(renderer!, t('supply.order.claim', { pct: 25 }))[0].props.onPress();
    });
    expect(useGameStore.getState().save.supply.orders[place.id].steps[0].claimed).toBe(true);
  });

  it('shrinks to a success banner once every step is claimed', () => {
    const place = tavernAt('p1', 30, 5);
    act(() => {
      useGameStore.setState({
        save: saveWithOrder(place, (order) => ({
          ...order,
          delivered: { grain: order.total },
          goldPaid: 300,
          steps: order.steps.map((step) => ({ ...step, claimed: true })),
        })),
      });
    });
    act(() => {
      renderer = create(<OrderSection place={place} player={position} now={now} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('Order filled.');
    expect(sheet).toContain('wants nothing more before it leaves.');
    expect(sheet).toContain(t('supply.order.claimedPlus', { gold: 300 }));
    expect(sheet).not.toContain(t('supply.order.wants'));
    expect(button(renderer!, t('supply.order.deliver'))).toHaveLength(0);
  });
});

describe('the Network tab’s Places section', () => {
  afterEach(() => act(() => renderer?.unmount()));
  let renderer: ReactTestRenderer | null = null;

  it('lists the live orders by time left, with their progress and headline', () => {
    const leavingSoon = tavernAt('p1', 30, 1);
    const staying = tavernAt('p2', 800, 5);
    const base = createInitialSave();
    const soon = makeOrder(base, leavingSoon, now);
    const late = makeOrder(base, staying, now);
    act(() => {
      useGameStore.setState({
        save: {
          ...base,
          supply: {
            ...base.supply,
            debugUnlocked: true,
            discovered: { [leavingSoon.id]: leavingSoon.expiresAt, [staying.id]: staying.expiresAt },
            orders: { [leavingSoon.id]: soon, [staying.id]: late },
          },
        },
      });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain(t('supply.order.places'));
    // The last-day order leaves the Places list and heads the Leaving soonest section instead.
    expect(sheet).toContain(t('supply.network.leavingSoonest'));
    const soonAt = sheet.indexOf(orderPlaceName(soon, tavernNameOf));
    const lateAt = sheet.indexOf(orderPlaceName(late, tavernNameOf));
    expect(soonAt).toBeGreaterThanOrEqual(0);
    expect(lateAt).toBeGreaterThan(soonAt);
    expect(sheet).toContain(t('supply.lastDay'));
    expect(sheet).not.toContain(t('supply.order.empty'));
  });

  it('says how to get an order while there is none', () => {
    act(() => {
      useGameStore.setState({ save: createInitialSave() });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    expect(text(renderer!)).toContain(t('supply.order.empty'));
  });
});
