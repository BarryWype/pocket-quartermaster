import { Profiler, createElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import { createInitialSave, type SaveData } from '@/game/save';
import type { Building, RoutePoint } from '@/game/supply/types';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';

import { SupplyMarkers } from '../SupplyMarkers';
import { SupplyRoute } from '../SupplyRoute';
import { RouteBar } from './RouteBar';
import { RouteModePins } from './RouteModePins';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
jest.mock('@/services/mapTiles', () => ({ walkableTiles: { load: () => Promise.resolve(null) } }));
// The map's pieces as plain views that keep their press handlers, so the tests can tap pins and the route line.
jest.mock('@maplibre/maplibre-react-native', () => {
  const { createElement: h } = jest.requireActual('react');
  const { View: V } = jest.requireActual('react-native');
  const piece = ({ children, ...props }: { children?: ReactNode }) => h(V, props, children);
  return { Marker: piece, ViewAnnotation: piece, GeoJSONSource: piece, Layer: () => null };
});

const origin = { latitude: -41.2865, longitude: 174.7762 };
const DAY = 24 * 3_600_000;

const building = (id: string, kind: Building['kind'], north: number, expiresIn = 5 * DAY): Building => ({
  id,
  kind,
  siteId: `site-${id}`,
  position: offsetPosition(origin, north, 0),
  quality: 2,
  builtAt: Date.now(),
  expiresAt: Date.now() + expiresIn,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
});

const saveWith = (buildings: Building[], route: RoutePoint[] = []): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    supply: { ...base.supply, debugUnlocked: true, hall: { cell: cellAt(origin), moves: [] }, buildings, cart: { ...base.supply.cart, route } },
  };
};

const byLabel = (renderer: ReactTestRenderer, label: string) => renderer.root.find((node) => node.props?.accessibilityLabel === label && typeof node.type !== 'string');
const pressPin = (renderer: ReactTestRenderer, id: string) =>
  act(() => {
    renderer.root.find((node) => node.props?.id === `route-pin:${id}` && typeof node.props?.onPress === 'function').props.onPress();
  });
const pressTitle = (renderer: ReactTestRenderer, title: string) =>
  act(() => {
    renderer.root.find((node) => node.props?.title === title && typeof node.props?.onPress === 'function').props.onPress();
  });
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const draft = () => useMapPanels.getState().routeMode?.draft;

/** Lets the street path (no tiles here: straight legs) be found. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('route mode', () => {
  let renderer: ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    act(() => useMapPanels.getState().closeRouteMode());
  });

  const open = (save: SaveData, route: RoutePoint[] = save.supply.cart.route) => {
    act(() => {
      useGameStore.setState({ save });
      useMapPanels.getState().openRouteMode(route);
    });
    act(() => {
      renderer = create(
        <>
          <RouteModePins />
          <SupplyRoute />
          <RouteBar />
        </>,
      );
    });
    return renderer!;
  };

  it('a tapped pin becomes the next numbered stop, and a tap on a numbered pin takes it off', async () => {
    const r = open(saveWith([building('b1', 'farm', 150), building('b2', 'quarry', -150)]));
    expect(text(r)).toContain('Tap the pins to add stops in order.');
    expect(byLabel(r, 'Farm: tap to add it as stop 1')).toBeTruthy();
    pressPin(r, 'b1');
    pressPin(r, 'b2');
    await settle();
    expect(draft()).toEqual([{ building: 'b1' }, { building: 'b2' }]);
    expect(byLabel(r, 'Quarry, stop 2: tap to take it off')).toBeTruthy();
    expect(byLabel(r, 'Stop 1: Farm')).toBeTruthy();
    expect(text(r)).toMatch(/Loop \d+ min · (no risky street|\d+ risky streets?) · nothing goes home/);
    pressPin(r, 'b1');
    expect(draft()).toEqual([{ building: 'b2' }]);
  });

  it('a chip moves a stop Earlier or Later, or takes it off', async () => {
    const r = open(saveWith([building('b1', 'farm', 150), building('b2', 'quarry', -150)]), [{ building: 'b1' }, { building: 'b2' }]);
    await settle();
    act(() => byLabel(r, 'Stop 2: Quarry').props.onPress());
    pressTitle(r, 'Earlier');
    expect(draft()).toEqual([{ building: 'b2' }, { building: 'b1' }]);
    act(() => byLabel(r, 'Stop 1: Quarry').props.onPress());
    pressTitle(r, 'Remove');
    expect(draft()).toEqual([{ building: 'b1' }]);
  });

  it('Save says why it is locked, then writes the route and leaves route mode', async () => {
    const r = open(saveWith([building('b1', 'farm', 150)]));
    const saveButton = () => r.root.find((node) => typeof node.props?.title === 'string' && node.props?.disabled !== undefined && /save|stop to/i.test(node.props.title));
    expect(saveButton().props.title).toBe('Add a stop to save');
    expect(saveButton().props.disabled).toBe(true);
    pressPin(r, 'b1');
    await settle();
    expect(saveButton().props.disabled).toBe(false);
    pressTitle(r, 'Save');
    expect(useGameStore.getState().save.supply.cart.route).toEqual([{ building: 'b1' }]);
    expect(useGameStore.getState().save.supply.cart.path?.stopAt).toHaveLength(1);
    expect(useMapPanels.getState().routeMode).toBeNull();
  });

  it('leaving with changes asks once; with none it just leaves', async () => {
    let r = open(saveWith([building('b1', 'farm', 150)]));
    pressTitle(r, 'Cancel');
    expect(useMapPanels.getState().routeMode).toBeNull();
    act(() => r.unmount());

    r = open(saveWith([building('b1', 'farm', 150)]));
    pressPin(r, 'b1');
    await settle();
    pressTitle(r, 'Cancel');
    expect(text(r)).toContain('Leave without saving?');
    pressTitle(r, 'Keep editing');
    expect(draft()).toEqual([{ building: 'b1' }]);
    pressTitle(r, 'Cancel');
    pressTitle(r, 'Leave without saving');
    expect(useMapPanels.getState().routeMode).toBeNull();
    expect(useGameStore.getState().save.supply.cart.route).toEqual([]);
  });

  it('a tap on the route line adds a grab point on that leg; tapping it offers Remove', async () => {
    const r = open(saveWith([building('b1', 'farm', 300)]), [{ building: 'b1' }]);
    await settle();
    // Halfway along the leg out to the farm, 10 m off the line.
    const lngLat = [offsetPosition(origin, 150, 10).longitude, offsetPosition(origin, 150, 10).latitude];
    act(() => {
      r.root.find((node) => node.props?.id === 'supply-route' && typeof node.props?.onPress === 'function').props.onPress({ stopPropagation: () => {}, nativeEvent: { lngLat } });
    });
    const grabbed = draft()!;
    expect(grabbed).toHaveLength(2);
    expect('via' in grabbed[0]).toBe(true);
    act(() => {
      r.root.find((node) => node.props?.id === 'route-grab:0' && typeof node.props?.onPress === 'function').props.onPress();
    });
    pressTitle(r, 'Remove grab point');
    expect(draft()).toEqual([{ building: 'b1' }]);
  });

  it('a stop that leaves before the next loop ends is marked on its pin and in the bar', async () => {
    const r = open(saveWith([building('b1', 'farm', 150, 60_000)]), [{ building: 'b1' }]);
    await settle();
    expect(text(r)).toContain('Farm leaves before the next loop ends');
    expect(text(r)).toContain('⏳');
  });

  it('a tap on a pin never re-renders the other markers; only entering and leaving route mode does', async () => {
    act(() => {
      useGameStore.setState({ save: saveWith([building('b1', 'farm', 150), building('b2', 'quarry', -150)]) });
    });
    const commits: string[] = [];
    act(() => {
      renderer = create(
        createElement(
          View,
          null,
          <Profiler id="markers" onRender={(_, phase) => commits.push(phase)}>
            <SupplyMarkers sites={[]} now={Date.now()} />
          </Profiler>,
          <RouteModePins />,
        ),
      );
    });
    expect(commits).toEqual(['mount']);
    act(() => useMapPanels.getState().openRouteMode([]));
    const entered = commits.length;
    expect(entered).toBeGreaterThan(1);
    pressPin(renderer!, 'b1');
    pressPin(renderer!, 'b2');
    pressPin(renderer!, 'b1');
    expect(useMapPanels.getState().routeMode?.draft).toEqual([{ building: 'b2' }]);
    expect(commits).toHaveLength(entered);
    act(() => useMapPanels.getState().closeRouteMode());
    expect(commits.length).toBeGreaterThan(entered);
  });

  it('a tap on a marker that can’t be a stop says why on the bar, until the next edit', async () => {
    act(() => {
      useGameStore.setState({ save: saveWith([building('near', 'farm', 150), building('far', 'quarry', 50_000)]) });
      useMapPanels.getState().openRouteMode([]);
    });
    act(() => {
      renderer = create(
        <>
          <SupplyMarkers sites={[]} now={Date.now()} />
          <RouteModePins />
          <RouteBar />
        </>,
      );
    });
    const r = renderer!;
    // The map's Marker (the mocked piece), not MapMarker around it: route mode swaps the press handler between the two.
    const pressMarker = (id: string) =>
      act(() => {
        r.root.findAll((node) => node.props?.id === id && typeof node.props?.onPress === 'function').at(-1)!.props.onPress();
      });
    pressMarker('supply-building:far');
    expect(text(r)).toMatch(/Quarry is too far from your hall\. Stops must be within [\d.,]+\W+k?m of it\./);
    pressMarker('supply-hall');
    expect(text(r)).toContain('Not a stop.');
    pressPin(r, 'near');
    expect(useMapPanels.getState().routeTapNote).toBeNull();
    await settle();
  });
});
