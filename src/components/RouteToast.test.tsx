import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import type { PlaceSpawn } from '@/game/places/generate';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore } from '@/store/worldStore';

import { ROUTE_TOAST_MS, RouteToast } from './RouteToast';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
jest.mock('@/services/mapTiles', () => ({ walkableTiles: { load: () => Promise.resolve(null) } }));

const origin = { latitude: -41.2865, longitude: 174.7762 };
const DAY = 24 * 3_600_000;

const siteAt = (id: string, northMeters: number): PlaceSpawn => ({
  id,
  kind: 'site',
  group: 'site',
  tile: 'test',
  position: offsetPosition(origin, northMeters, 0),
  startsAt: Date.now() - 1000,
  expiresAt: Date.now() + 5 * DAY,
  roll: 0.1,
});

/** A save with the hall at the origin and the sites discovered. */
const saveWithSites = (sites: PlaceSpawn[]): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    supply: {
      ...base.supply,
      hall: { cell: cellAt(origin), moves: [] },
      discovered: Object.fromEntries(sites.map((site) => [site.id, site.expiresAt])),
    },
  };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const press = (renderer: ReactTestRenderer, label: string) => renderer.root.findByProps({ accessibilityLabel: label }).props.onPress();

describe('routes that look after themselves', () => {
  let renderer: ReactTestRenderer | null = null;
  beforeEach(() => {
    useSettingsStore.setState({ autoRoute: true });
    useWorldStore.setState({ routeNote: null });
    useMapPanels.setState({ routePlanner: null, supplyBuilding: null });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    jest.useRealTimers();
  });

  it('the first building makes the route, hall → building → hall, and says so', () => {
    const site = siteAt('site:a', 150);
    useGameStore.setState({ save: saveWithSites([site]) });
    useGameStore.getState().build(site, 'farm', origin, true);
    const { cart, buildings } = useGameStore.getState().save.supply;
    expect(cart.route).toEqual([{ building: buildings[0].id }]);
    expect(useWorldStore.getState().routeNote).toMatchObject({ text: 'Farm added to the delivery route', undo: { route: [], path: null } });
  });

  it('a discovered place that wants what a building on the route makes joins it after that building', () => {
    const site = siteAt('site:a', 150);
    const tavern: PlaceSpawn = { ...siteAt('place:tavern:1', 60), kind: 'tavern', group: 'place' } as PlaceSpawn;
    useGameStore.setState({ save: saveWithSites([site]) });
    useGameStore.getState().build(site, 'farm', origin, true);
    useGameStore.getState().discoverPlaces([tavern], tavern.position);
    const { cart, buildings } = useGameStore.getState().save.supply;
    expect(cart.route).toEqual([{ building: buildings[0].id }, { place: tavern.id, position: tavern.position }]);
    expect(useWorldStore.getState().routeNote?.text).toMatch(/added to the delivery route$/);
  });

  it('with the setting off, a new building stays off the route', () => {
    useSettingsStore.setState({ autoRoute: false });
    const site = siteAt('site:a', 150);
    useGameStore.setState({ save: saveWithSites([site]) });
    useGameStore.getState().build(site, 'farm', origin, true);
    expect(useGameStore.getState().save.supply.cart.route).toEqual([]);
    expect(useWorldStore.getState().routeNote).toBeNull();
  });

  it('a stop whose time is up leaves the route when the network settles, with a note', () => {
    const sites = [siteAt('site:a', 150), siteAt('site:b', -150)];
    useGameStore.setState({ save: saveWithSites(sites) });
    useGameStore.getState().build(sites[0], 'farm', origin, true);
    useGameStore.getState().build(sites[1], 'quarry', origin, true);
    const [farm, quarry] = useGameStore.getState().save.supply.buildings;
    expect(useGameStore.getState().save.supply.cart.route).toHaveLength(2);
    useGameStore.getState().debugExpireBuilding(farm.id);
    expect(useGameStore.getState().save.supply.cart.route).toEqual([{ building: quarry.id }]);
    expect(useWorldStore.getState().routeNote).toMatchObject({ text: 'Farm left the delivery route: its time is up', undo: null });
  });

  it('the toast waits while a sheet covers the map, then Undo puts the route back', () => {
    const site = siteAt('site:a', 150);
    useGameStore.setState({ save: saveWithSites([site]) });
    useGameStore.getState().build(site, 'farm', origin, true);
    act(() => {
      useMapPanels.setState({ supplyBuilding: 'b1' });
    });
    act(() => {
      renderer = create(<RouteToast />);
    });
    expect(renderer!.toJSON()).toBeNull();
    act(() => {
      useMapPanels.setState({ supplyBuilding: null });
    });
    expect(text(renderer!)).toContain('Farm added to the delivery route');
    act(() => press(renderer!, 'Undo: put the delivery route back as it was'));
    expect(useGameStore.getState().save.supply.cart.route).toEqual([]);
    expect(useWorldStore.getState().routeNote).toBeNull();
  });

  it('Edit opens the route planner on the route, and the toast leaves on its own after a while', () => {
    jest.useFakeTimers();
    const site = siteAt('site:a', 150);
    useGameStore.setState({ save: saveWithSites([site]) });
    useGameStore.getState().build(site, 'farm', origin, true);
    act(() => {
      renderer = create(<RouteToast />);
    });
    act(() => {
      jest.advanceTimersByTime(ROUTE_TOAST_MS - 100);
    });
    expect(text(renderer!)).toContain('Farm added');
    act(() => press(renderer!, 'Edit the delivery route'));
    expect(useMapPanels.getState().routePlanner).toEqual(useGameStore.getState().save.supply.cart.route);
    expect(renderer!.toJSON()).toBeNull();

    act(() => {
      useMapPanels.setState({ routePlanner: null });
      useWorldStore.setState({ routeNote: { text: 'x', undo: null, at: 1 } });
    });
    act(() => {
      jest.advanceTimersByTime(ROUTE_TOAST_MS);
    });
    expect(useWorldStore.getState().routeNote).toBeNull();
  });
});
