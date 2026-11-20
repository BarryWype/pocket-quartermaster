import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import { createInitialSave } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';

import { HallSheet } from './HallSheet';
import { MarkerChooser } from './MarkerChooser';
import { offerChooser, type MarkerHit } from './markerHits';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
jest.mock('@/hooks/useCellTerrains', () => ({ useCellTerrains: (cells: string[]) => Object.fromEntries(cells.map((cell) => [cell, 'green' as const])) }));
jest.mock('@/services/mapTiles', () => ({ walkableTiles: { load: () => Promise.resolve(null) } }));

const origin = { latitude: -41.2865, longitude: 174.7762 };
const reset = () =>
  act(() => {
    useMapPanels.setState({ chooser: null, placingHall: false, hallCell: null, place: null, sanctum: null, tavern: null, patrol: null, site: null, routeMode: null });
  });

const hit = (id: string, meters: number, open = jest.fn()): MarkerHit => ({
  id,
  at: () => offsetPosition(origin, meters, 90),
  emoji: '🍺',
  name: `Marker ${id}`,
  open,
});

describe('taps on the map', () => {
  let renderer: ReactTestRenderer | null = null;
  beforeEach(() => {
    reset();
    act(() => {
      useGameStore.setState({ save: createInitialSave() });
    });
  });
  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = null;
  });

  it('an empty tap opens nothing', () => {
    act(() => {
      useMapPanels.getState().tapMap(origin);
    });
    const state = useMapPanels.getState();
    expect([state.hallCell, state.place, state.sanctum, state.tavern, state.patrol, state.site, state.chooser]).toEqual([null, null, null, null, null, null, null]);
  });

  it('while placing the hall, a tap opens the hall sheet for that spot and ends the placing', () => {
    act(() => {
      useMapPanels.getState().startPlacingHall();
    });
    expect(useMapPanels.getState().placingHall).toBe(true);
    const spot = offsetPosition(origin, 400, 0);
    act(() => {
      useMapPanels.getState().tapMap(spot);
    });
    expect(useMapPanels.getState().hallCell).toBe(cellAt(spot));
    expect(useMapPanels.getState().placingHall).toBe(false);
  });

  it('the hall sheet offers to pick a spot on the map', () => {
    act(() => {
      renderer = create(<HallSheet cell={cellAt(origin)} player={origin} onClose={() => {}} />);
    });
    act(() => {
      renderer!.root.findAll((node) => node.props.title === 'Pick a spot on the map' && typeof node.props.onPress === 'function')[0].props.onPress();
    });
    expect(useMapPanels.getState().placingHall).toBe(true);
    expect(renderer!.root.findAll((node) => node.props.title === 'Place the hall here').length).toBeGreaterThan(0);
  });

  it('a lone marker opens as before: no chooser', () => {
    const hits = [hit('a', 0), hit('b', 200)];
    expect(offerChooser('a', hits, origin, 17, null)).toBe(false);
    expect(useMapPanels.getState().chooser).toBeNull();
  });

  it('overlapping markers open the chooser, tapped first then nearest; picking one opens its sheet', () => {
    const openB = jest.fn();
    // At zoom 17 a point is about 0.45 m here, so 40 points reach about 18 m.
    const hits = [hit('a', 0), hit('c', 12), hit('b', 4, openB), hit('far', 200)];
    let offered = false;
    act(() => {
      offered = offerChooser('a', hits, origin, 17, null);
    });
    expect(offered).toBe(true);
    const chooser = useMapPanels.getState().chooser!;
    expect(chooser.entries.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    act(() => {
      renderer = create(<MarkerChooser />);
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('3 markers here');
    const rows = renderer!.root.findAll((node) => node.props.accessibilityRole === 'menuitem' && typeof node.props.onPress === 'function');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const row = rows.find((node) => String(node.props.accessibilityLabel).startsWith('Marker b'))!;
    act(() => {
      row.props.onPress();
    });
    expect(openB).toHaveBeenCalledTimes(1);
    expect(useMapPanels.getState().chooser).toBeNull();
  });
});
