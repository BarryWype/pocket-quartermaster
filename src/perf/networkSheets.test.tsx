/**
 * Map UI pass, prompt 2 step 4: what the network's new map pieces cost. The
 * Network toggle (the markers dim, the wash goes on), a minute tick with a
 * badge on every one of eight buildings, and the first open of the building,
 * site and cart sheets. Logged, not asserted beyond "it rendered": the numbers
 * move with the machine. Phone estimate: ×4.
 */
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { SupplyCampPanel } from '@/components/SupplyCampPanel';
import { SupplyCartPanel } from '@/components/SupplyCartPanel';
import { SupplyMarkers } from '@/components/SupplyMarkers';
import { SupplyRoute } from '@/components/SupplyRoute';
import { SupplySitePanel } from '@/components/SupplySitePanel';
import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import type { PlaceSpawn } from '@/game/places/generate';
import { createInitialSave } from '@/game/save';
import type { Building } from '@/game/supply/types';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
jest.mock('@/services/mapTiles', () => ({ walkableTiles: { load: () => Promise.resolve(null) } }));
jest.mock('@maplibre/maplibre-react-native', () => {
  const { createElement: h } = jest.requireActual('react');
  const { View: V } = jest.requireActual('react-native');
  const piece = ({ children, ...props }: { children?: ReactNode }) => h(V, props, children);
  return { Marker: piece, ViewAnnotation: piece, GeoJSONSource: piece, Layer: () => null };
});

const PHONE_FACTOR = 4;
const origin = { latitude: -41.2865, longitude: 174.7762 };
const kinds: Building['kind'][] = ['farm', 'quarry', 'lumberCamp', 'herbGarden', 'huntingCamp', 'farm', 'quarry', 'lumberCamp'];

const building = (i: number): Building => ({
  id: `b${i}`,
  kind: kinds[i],
  siteId: `site-${i}`,
  position: offsetPosition(origin, 120 * Math.cos(i), 120 * Math.sin(i)),
  quality: 2,
  builtAt: Date.now(),
  // Half in their last day, half full or idle: every marker carries a badge.
  expiresAt: Date.now() + (i % 2 === 0 ? 5 : 100) * 3_600_000,
  heroId: null,
  postedAt: null,
  stock: { grain: i % 3 === 0 ? 999 : 3 },
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
});

const site: PlaceSpawn = {
  id: 'site:perf',
  kind: 'site',
  group: 'site',
  tile: 'perf',
  position: offsetPosition(origin, 200, 0),
  startsAt: Date.now() - 1000,
  expiresAt: Date.now() + 3 * 24 * 3_600_000,
  roll: 0.5,
};

describe('network sheets and badges', () => {
  it('times the Network toggle, the badges and each sheet’s first open', () => {
    const base = createInitialSave();
    act(() => {
      useGameStore.setState({
        save: {
          ...base,
          supply: {
            ...base.supply,
            debugUnlocked: true,
            hall: { cell: cellAt(origin), moves: [] },
            buildings: kinds.map((_, i) => building(i)),
            discovered: { [site.id]: site.expiresAt },
            cart: { ...base.supply.cart, route: [{ building: 'b0' }, { building: 'b1' }] },
          },
        },
      });
    });
    let markers = 0;
    const onMarkers: ProfilerOnRenderCallback = (_, __, actual) => {
      markers += actual;
    };
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <Profiler id="markers" onRender={onMarkers}>
          <SupplyMarkers sites={[site]} now={Date.now()} />
          <SupplyRoute />
        </Profiler>,
      );
    });
    const mount = markers;
    markers = 0;
    act(() => useMapPanels.getState().toggleNetworkOnly());
    const toggleOn = markers;
    markers = 0;
    act(() => useMapPanels.getState().toggleNetworkOnly());
    const toggleOff = markers;
    expect(renderer.root.findAll((node) => typeof node.props?.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('last day')).length).toBeGreaterThan(0);
    act(() => renderer.unmount());

    const sheet = (node: ReactNode) => {
      let ms = 0;
      let opened!: ReturnType<typeof create>;
      act(() => {
        opened = create(
          <Profiler id="sheet" onRender={(_, __, actual) => (ms += actual)}>
            {node}
          </Profiler>,
        );
      });
      act(() => opened.unmount());
      return ms;
    };
    const buildingCold = sheet(<SupplyCampPanel id="b0" player={origin} onClose={() => {}} />);
    // The first sheet pays for the shared pieces' first mount (MapSheet, Overlay); the second is the sheet's own cost.
    const buildingMs = sheet(<SupplyCampPanel id="b1" player={origin} onClose={() => {}} />);
    const siteMs = sheet(<SupplySitePanel site={site} player={origin} onClose={() => {}} />);
    const cartMs = sheet(<SupplyCartPanel onClose={() => {}} />);

    const line = (name: string, ms: number) => `  ${name}: ${ms.toFixed(1)} (phone ≈ ${(ms * PHONE_FACTOR).toFixed(0)})`;
    console.log(
      [
        'Network sheets and badges (8 buildings, each with a badge), render ms on this machine:',
        line('markers mount', mount),
        line('Network toggle on', toggleOn),
        line('Network toggle off', toggleOff),
        line('first network sheet of the session (cold)', buildingCold),
        line('building sheet first open', buildingMs),
        line('site sheet first open', siteMs),
        line('cart sheet first open', cartMs),
      ].join('\n'),
    );
  });
});
