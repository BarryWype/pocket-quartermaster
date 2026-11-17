import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { Building, RoutePoint } from '@/game/supply/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useSettingsStore } from '@/store/settingsStore';

import { RoutePlannerBar } from './RoutePlannerBar';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

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

/** A save with a hall and one building, like the cart sheet's tests. */
const withNetwork = (): SaveData => {
  const base = createInitialSave();
  return { ...base, supply: { ...base.supply, hall: { cell: hallCell, moves: [] }, buildings: [building] } };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

/** The Save button's disabled state, from its accessibility props. */
const saveDisabled = (renderer: ReactTestRenderer) =>
  renderer.root.findAll((node) => node.props.accessibilityLabel === 'Save')[0].props.accessibilityState.disabled;

describe('the route planner bar', () => {
  let renderer: ReactTestRenderer | null = null;
  beforeEach(() => {
    jest.useFakeTimers();
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save: withNetwork() });
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    useMapPanels.setState({ routeDraft: null, draftPreview: null });
    useSettingsStore.setState({ supplyLines: false });
    jest.useRealTimers();
  });

  const open = (draft: RoutePoint[]) => {
    act(() => {
      useMapPanels.getState().planRoute(draft);
    });
    act(() => {
      renderer = create(<RoutePlannerBar />);
    });
    // The preview lands one tick after the draft changes.
    act(() => {
      jest.runOnlyPendingTimers();
    });
    return { sheet: text(renderer!), disabled: saveDisabled(renderer!) };
  };

  it('a draft with a building: the points line, the numbers, and an enabled Save', () => {
    const { sheet, disabled } = open([{ building: 'b1' }]);
    expect(sheet).toContain('The hall → Farm → The hall');
    expect(sheet).toContain('min a loop');
    expect(sheet).toContain('Ambush risk');
    expect(sheet).toContain('Tap buildings in order, and any cell as a waypoint to steer around danger.');
    expect(disabled).toBe(false);
  });

  it('a draft with only a waypoint: Save is disabled', () => {
    const { sheet, disabled } = open([{ via: offsetPosition(origin, 1500, 90) }]);
    expect(sheet).toContain('The hall → waypoint → The hall');
    expect(disabled).toBe(true);
  });

  it('adds, undoes and clears points in the draft', () => {
    act(() => {
      useMapPanels.getState().planRoute([]);
      useMapPanels.getState().addToRoute({ building: 'b1' });
      useMapPanels.getState().addToRoute({ via: tileCenter(hallCell) });
    });
    expect(useMapPanels.getState().routeDraft).toEqual([{ building: 'b1' }, { via: tileCenter(hallCell) }]);
    act(() => useMapPanels.getState().undoRoute());
    expect(useMapPanels.getState().routeDraft).toEqual([{ building: 'b1' }]);
    act(() => useMapPanels.getState().clearRoute());
    expect(useMapPanels.getState().routeDraft).toEqual([]);
  });
});
