import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { addCells, cellAt } from '@/game/discovery/cells';
import { heroStatus } from '@/game/expeditions/party';
import { offsetPosition } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import { periodAt } from '@/game/supply/period';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { t } from '@/i18n';

import { statusText } from './HeroPicker';
import { SupplyCellPanel } from './SupplyCellPanel';
import { SupplyLayers } from './SupplyLayers';
import { SupplyMarkers } from './SupplyMarkers';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
// The layers read the clock, which needs a focus context; here the screen counts as focused.
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
// The library is native-bound; the components only need its map pieces to exist.
jest.mock('@maplibre/maplibre-react-native', () => ({ GeoJSONSource: () => null, Layer: () => null, Marker: () => null }));
// The panel's terrain comes from the map tiles; here it is fixed, so the sheet is deterministic.
jest.mock('@/hooks/useCellTerrains', () => ({ useCellTerrains: (cells: string[]) => Object.fromEntries(cells.map((cell) => [cell, 'green' as const])) }));
jest.mock('@/services/mapTiles', () => ({ walkableTiles: { load: () => Promise.resolve(null) } }));

const position = { latitude: -41.2865, longitude: 174.7762 };
const cell = cellAt(position);
// A cell well beyond the 2 km hall radius, so founding is blocked with a visible reason.
const hallCell = cellAt(offsetPosition(position, 3000, 0));

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe('the supply lines on the map', () => {
  afterEach(() => {
    useSettingsStore.setState({ supplyLines: false });
    act(() => renderer?.unmount());
  });
  let renderer: ReactTestRenderer | null = null;

  it('renders nothing while the switch is off', () => {
    useSettingsStore.setState({ supplyLines: false });
    act(() => {
      renderer = create(
        <>
          <SupplyMarkers />
          <SupplyLayers bounds={null} position={position} />
        </>,
      );
    });
    expect(renderer!.toJSON()).toBeNull();
  });

  it('shows a scouted green cell with the hall elsewhere: the found buttons and the blocking reason', () => {
    useSettingsStore.setState({ supplyLines: true });
    const base = createInitialSave();
    act(() => {
      useGameStore.setState({
        save: {
          ...base,
          supply: {
            ...base.supply,
            hall: { cell: hallCell, movedAt: 0 },
            scouted: addCells({}, [cell], periodAt(Date.now())),
          },
        },
      });
    });
    act(() => {
      renderer = create(<SupplyCellPanel cell={cell} player={tileCenter(cell)} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('Found a timber camp');
    expect(sheet).toContain('Found a trapper');
    expect(sheet).toContain('Too far from the hall');
    // The scouted cell shows its richness, not the not-scouted line.
    expect(sheet).toContain('Timber');
    expect(sheet).not.toContain('Not scouted yet');
  });

  it('shows a posted hero as Posted in the picker', () => {
    const base = createInitialSave();
    const camp: SaveData['supply']['camps'][number] = {
      id: 'c1',
      kind: 'timber',
      cell,
      terrain: 'green',
      foundedAt: 0,
      heroId: 'lyra',
      postedAt: 0,
      stock: {},
      progress: 0,
      made: 0,
      settledAt: 0,
      inspectedUntil: 0,
      closedUntil: 0,
    };
    const save: SaveData = { ...base, supply: { ...base.supply, camps: [camp] } };
    const hero = save.heroes.find((h) => h.id === 'lyra')!;
    const status = heroStatus(save, hero, 0);
    expect(status.kind).toBe('posted');
    expect(statusText({ hero, status, lights: [], changes: [], score: 0 })).toBe(t('supply.posted'));
  });
});
