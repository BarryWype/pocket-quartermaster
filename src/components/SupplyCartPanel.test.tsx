import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import { startCart } from '@/game/supply/cart';
import type { Camp } from '@/game/supply/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { useCartTick } from '@/hooks/useCartTick';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

import { SupplyCartPanel } from './SupplyCartPanel';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const origin = { latitude: -41.2865, longitude: 174.7762 };
const hallCell = cellAt(origin);
const campCell = cellAt(offsetPosition(origin, 400, 0));

const camp: Camp = {
  id: 'c1',
  kind: 'timber',
  cell: campCell,
  quality: 2,
  foundedAt: 0,
  heroId: null,
  postedAt: null,
  stock: { wood: 5 },
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
};

/** A save with a hall, one camp, and the cart parked with no route. */
const withNetwork = (cart: Partial<SaveData['supply']['cart']> = {}): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    supply: { ...base.supply, hall: { cell: hallCell, moves: [] }, camps: [camp], cart: { ...base.supply.cart, ...cart } },
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

  it('running: shows the loop and when it is back', () => {
    const sheet = open(startCart(withNetwork({ route: [{ camp: 'c1' }] }), Date.now()));
    expect(sheet).toContain('Loop 1: back at the hall in');
    expect(sheet).toContain('Stop after this loop');
    expect(sheet).toContain('The crew can change once the cart is parked.');
  });

  it('back with a hurt crew: names them and offers to start again', () => {
    const base = withNetwork({ route: [{ camp: 'c1' }], crew: { driver: 'bram', escorts: [] }, waitingForCrew: true });
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
    mount(withNetwork({ route: [{ camp: 'c1' }] }));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('waits for the next event while a loop runs', () => {
    mount(startCart(withNetwork({ route: [{ camp: 'c1' }] }), Date.now()));
    expect(jest.getTimerCount()).toBe(1);
  });
});
