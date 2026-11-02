import { act, create } from 'react-test-renderer';
import { useEffect, type RefObject } from 'react';
import type { MapRef } from '@maplibre/maplibre-react-native';

import { useFoliage } from './MapFoliage';
import type { Bounds } from '@/game/generation/foliage';

// The library is native-bound; the hook test only needs its map components to exist.
jest.mock('@maplibre/maplibre-react-native', () => ({
  GeoJSONSource: () => null,
  Images: () => null,
  Layer: () => null,
}));

const bounds: Bounds = [174.77, -41.29, 174.78, -41.28];

/** The map, spied on: the query is the expensive step placement starts with. */
const queryRenderedFeatures = jest.fn(() => Promise.resolve([]));
const map = { getBounds: () => Promise.resolve(bounds), queryRenderedFeatures } as unknown as MapRef;
const mapRef = { current: map } as RefObject<MapRef | null>;

let hook: ReturnType<typeof useFoliage>;

/** Renders the hook with the given visibility and refreshes the placement. */
function renderFoliage(visible: boolean) {
  act(() => {
    create(<Foliage visible={visible} />);
  });
}

function Foliage({ visible }: { visible: boolean }) {
  const foliage = useFoliage(mapRef, false, visible);
  useEffect(() => {
    hook = foliage;
  });
  return null;
}

/** Runs the placement timers refresh schedules (the second pass is the one after tiles load). */
async function runPlacementTimers() {
  await act(async () => {
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
  });
}

describe('useFoliage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    queryRenderedFeatures.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never touches the map while the decorations are hidden (below their zoom)', async () => {
    renderFoliage(false);
    act(() => {
      hook.refresh();
    });
    await runPlacementTimers();
    expect(queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it('queries the map and places plants once visible', async () => {
    renderFoliage(true);
    act(() => {
      hook.refresh();
    });
    await runPlacementTimers();
    expect(queryRenderedFeatures).toHaveBeenCalled();
  });
});
