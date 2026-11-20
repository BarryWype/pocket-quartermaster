import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import type { Building } from '@/game/supply/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';

import { sheetKit } from './network/sheetTestKit';
import { SupplyCampPanel } from './SupplyCampPanel';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const origin = { latitude: -41.2865, longitude: 174.7762 };
const DAY = 24 * 3_600_000;

const buildingIn = (extra: Partial<Building> = {}): Building => ({
  id: 'b1',
  kind: 'herbGarden',
  siteId: 's1',
  position: origin,
  quality: 1,
  builtAt: Date.now(),
  expiresAt: Date.now() + 6 * DAY,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
  ...extra,
});

const saveWithBuilding = (building: Building, supply: Partial<SaveData['supply']> = {}): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    heroes: base.heroes.map((h) => (h.id === 'bram' ? { ...h, trade: { id: 'herbalist', hours: 40 } } : h)),
    supply: { ...base.supply, buildings: [building], ...supply },
  };
};

let renderer: ReactTestRenderer | null = null;
const kit = sheetKit(() => renderer!);
const open = (save: SaveData, player = origin) => {
  act(() => {
    useGameStore.setState({ save });
  });
  act(() => {
    renderer = create(<SupplyCampPanel id="b1" player={player} onClose={() => {}} />);
  });
};

describe('the building sheet', () => {
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    useMapPanels.setState({ routeMode: null });
  });

  it('a locals-only building: the summary line, Post a hero first, and the delivery route under it', () => {
    open(saveWithBuilding(buildingIn()));
    const sheet = kit.text();
    // What it makes, how full it is, and who collects it, in one line with units.
    expect(sheet).toContain('Making');
    expect(sheet).toContain('herbs an hour · 0 of 57 stored · nothing collects it');
    expect(kit.titles()).toEqual(expect.arrayContaining(['Post a hero', 'Add to the delivery route']));
    expect(sheet).not.toContain('Recall');

    // Post a hero opens the People tab on its picker; the empty portrait slot says what a tap does.
    kit.press('Post a hero');
    expect(kit.byLabel('No hero posted: tap to post one')).toBeTruthy();
    expect(kit.text()).toContain('Locals work it at 60%');
  });

  it('a posted building: its next step is the delivery route, and People shows the hero and Recall', () => {
    open(saveWithBuilding(buildingIn({ heroId: 'bram', postedAt: Date.now() })));
    expect(kit.titles()).toContain('Add to the delivery route');
    kit.press('Add to the delivery route');
    // Route mode opens with this building added as the last stop.
    expect(useMapPanels.getState().routeMode?.draft).toEqual([{ building: 'b1' }]);

    act(() => renderer!.unmount());
    open(saveWithBuilding(buildingIn({ heroId: 'bram', postedAt: Date.now() })));
    kit.press('More');
    kit.tap('People');
    const sheet = kit.text();
    expect(sheet).toContain('Bram');
    // Quality 1 at the full rate with a level 2 Herbalist: +50%, 3.6 an hour.
    expect(sheet).toContain('Herbalist, level 2 · +50%: 3.6 herbs an hour');
    expect(kit.titles()).toEqual(expect.arrayContaining(['Change worker', 'Recall Bram']));
    expect(kit.byLabel('Bram works here: tap to change')).toBeTruthy();
  });

  it('on the delivery route: says when the cart calls, and collecting is the main action, a walk when away', () => {
    const save = saveWithBuilding(buildingIn({ heroId: 'bram', postedAt: Date.now(), stock: { herb: 4 } }), {
      hall: { cell: cellAt(offsetPosition(origin, 200, 0)), moves: [] },
    });
    const withRoute = { ...save, supply: { ...save.supply, cart: { ...save.supply.cart, route: [{ building: 'b1' }] } } };
    open(withRoute, offsetPosition(origin, 300, 0));
    const sheet = kit.text();
    expect(sheet).toContain('4 of 57 stored · the cart is parked');
    expect(kit.titles()).toEqual(expect.arrayContaining(['Edit delivery route']));
    expect(kit.titles().some((title) => title.startsWith('Walk') && title.endsWith('to collect 4'))).toBe(true);
  });

  it('warns in the last day: the lost stock, the hero coming home, and collecting first', () => {
    open(saveWithBuilding(buildingIn({ heroId: 'bram', postedAt: Date.now(), expiresAt: Date.now() + 9 * 3_600_000, stock: { herb: 3 } })));
    const sheet = kit.text();
    expect(sheet).toContain('Stock the cart hasn’t taken is lost.');
    expect(sheet).toContain('Bram comes home.');
    expect(kit.titles()).toEqual(expect.arrayContaining(['Collect 3', 'Add to the delivery route']));
  });
});
