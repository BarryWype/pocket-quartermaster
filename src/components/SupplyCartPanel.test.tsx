import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import { startCart } from '@/game/supply/cart';
import type { Building, CartLogLine } from '@/game/supply/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { useCartTick } from '@/hooks/useCartTick';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

import { SupplyCartPanel } from './SupplyCartPanel';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const origin = { latitude: -41.2865, longitude: 174.7762 };
const hallCell = cellAt(origin);

const building: Building = {
  id: 'b1',
  kind: 'farm',
  siteId: 's1',
  position: offsetPosition(origin, 400, 0),
  quality: 2,
  builtAt: 0,
  expiresAt: Date.now() + 6 * 24 * 3_600_000,
  heroId: null,
  postedAt: null,
  stock: { grain: 5 },
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
};

/** A save with a hall, one building, and the cart parked with no route. */
const withNetwork = (cart: Partial<SaveData['supply']['cart']> = {}): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    supply: { ...base.supply, debugUnlocked: true, hall: { cell: hallCell, moves: [] }, buildings: [building], cart: { ...base.supply.cart, ...cart } },
  };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe('the cart sheet', () => {
  let renderer: ReactTestRenderer | null = null;
  afterEach(() => {
    useSettingsStore.setState({ supplyLines: false });
    act(() => renderer?.unmount());
    renderer = null;
  });

  const open = (save: SaveData) => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save });
    });
    act(() => {
      renderer = create(<SupplyCartPanel onClose={() => {}} />);
    });
    return text(renderer!);
  };

  it('parked with no route: says to plan one, and why it cannot start', () => {
    const sheet = open(withNetwork());
    expect(sheet).toContain('Parked at the hall.');
    expect(sheet).toContain('No route yet: plan one on the map.');
    expect(sheet).toContain('Plan a route first.');
  });

  it('running: shows the stop it is heading to and when it is back', () => {
    const sheet = open(startCart(withNetwork({ route: [{ building: 'b1' }] }), Date.now()));
    expect(sheet).toContain('On its way to Farm, back at the hall in');
    expect(sheet).toContain('Stop after this loop');
    expect(sheet).toContain('The crew can change once the cart is parked.');
  });

  it('tells the last loops as sentences: what went where, what came home, and the empty one', () => {
    const log: CartLogLine[] = [
      { n: 1, endedAt: Date.now() - 2 * 3_600_000, delivered: { stone: 4 }, places: [{ placeId: 't1', goods: { grain: 8 }, gold: 10 }], ambush: null },
      { n: 2, endedAt: Date.now() - 3_600_000, delivered: {}, places: [], ambush: null },
    ];
    const sheet = open(withNetwork({ log }));
    expect(sheet).toContain('Delivered');
    expect(sheet).toContain('to t1');
    expect(sheet).toContain('home.');
    expect(sheet).toContain('Came home empty.');
  });

  it('back with a hurt crew: names them and offers to start again', () => {
    const base = withNetwork({ route: [{ building: 'b1' }], crew: { driver: 'bram', escorts: [] }, waitingForCrew: true });
    const save = { ...base, heroes: base.heroes.map((hero) => (hero.id === 'bram' ? { ...hero, hp: 1, hpAt: Date.now() } : hero)) };
    const sheet = open(save);
    expect(sheet).toContain('Bram');
    expect(sheet).toContain('Start again');
  });
});

describe('the cart tick', () => {
  function Probe() {
    useCartTick();
    return null;
  }
  let renderer: ReactTestRenderer | null = null;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    useSettingsStore.setState({ supplyLines: false });
    jest.useRealTimers();
  });

  const mount = (save: SaveData) => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save });
    });
    act(() => {
      renderer = create(<Probe />);
    });
  };

  it('schedules nothing while the cart is parked', () => {
    mount(withNetwork({ route: [{ building: 'b1' }] }));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('waits for the next event while a loop runs', () => {
    mount(startCart(withNetwork({ route: [{ building: 'b1' }] }), Date.now()));
    expect(jest.getTimerCount()).toBe(1);
  });
});
