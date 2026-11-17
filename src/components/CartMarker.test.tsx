import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import { startLoop } from '@/game/supply/cart';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

import { CartMarker } from './CartMarker';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
jest.mock('@maplibre/maplibre-react-native', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return { Marker: ({ children }: { children: unknown }) => createElement(View, { testID: 'cart-marker' }, children) };
});

const origin = { latitude: -41.2865, longitude: 174.7762 };

/** A save whose cart runs a loop: a hall, and a route through a cell 400 m away. */
const running = (): SaveData => {
  const base = createInitialSave();
  const save: SaveData = { ...base, supply: { ...base.supply, hall: { cell: cellAt(origin), moves: [] } } };
  const route = [{ via: offsetPosition(origin, 400, 0) }];
  return startLoop({ ...save, supply: { ...save.supply, cart: { ...save.supply.cart, route } } }, Date.now() - 60_000);
};

describe('the cart marker', () => {
  let renderer: ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    useSettingsStore.setState({ supplyLines: false });
  });

  const mount = (save: SaveData) => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save });
    });
    act(() => {
      renderer = create(<CartMarker />);
    });
    return renderer!;
  };

  it('renders nothing while the cart is parked', () => {
    expect(mount(createInitialSave()).toJSON()).toBe(null);
  });

  it('renders a marker while a loop runs', () => {
    expect(mount(running()).root.findAllByProps({ testID: 'cart-marker' }).length).toBeGreaterThan(0);
  });
});
