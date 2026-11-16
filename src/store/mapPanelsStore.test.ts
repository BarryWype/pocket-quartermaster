import { act } from 'react-test-renderer';

import { useMapPanels } from '@/store/mapPanelsStore';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

const reset = () => useMapPanels.setState({ routeDraft: null, cartOpen: false });

describe('the route planner store slice', () => {
  afterEach(reset);

  it('addToRoute appends to the draft, starting one from nothing', () => {
    act(() => useMapPanels.getState().planRoute([]));
    act(() => useMapPanels.getState().addToRoute({ building: 'b1' }));
    act(() => useMapPanels.getState().addToRoute({ cell: 'abc' }));
    expect(useMapPanels.getState().routeDraft).toEqual([{ building: 'b1' }, { cell: 'abc' }]);
  });

  it('undoRoute drops the last point, and an empty draft stays open', () => {
    act(() => useMapPanels.getState().planRoute([{ building: 'b1' }, { cell: 'abc' }]));
    act(() => useMapPanels.getState().undoRoute());
    expect(useMapPanels.getState().routeDraft).toEqual([{ building: 'b1' }]);
    act(() => useMapPanels.getState().undoRoute());
    expect(useMapPanels.getState().routeDraft).toEqual([]);
  });

  it('clearRoute empties the draft but keeps the planner open', () => {
    act(() => useMapPanels.getState().planRoute([{ building: 'b1' }]));
    act(() => useMapPanels.getState().clearRoute());
    expect(useMapPanels.getState().routeDraft).toEqual([]);
    expect(useMapPanels.getState().routeDraft).not.toBe(null);
  });

  it('cancelRoute closes the planner', () => {
    act(() => useMapPanels.getState().planRoute([{ building: 'b1' }]));
    act(() => useMapPanels.getState().cancelRoute());
    expect(useMapPanels.getState().routeDraft).toBe(null);
  });
});
