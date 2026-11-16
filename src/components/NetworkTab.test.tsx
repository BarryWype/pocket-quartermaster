import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import { periodAt } from '@/game/supply/period';
import { cellRichness } from '@/game/supply/richness';
import type { Camp } from '@/game/supply/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

import { NetworkTab } from './NetworkTab';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const origin = { latitude: -41.2865, longitude: 174.7762 };

const richnessOneCell = (): string => {
  const period = periodAt(Date.now());
  for (let i = 0; i < 5000; i++) {
    const cell = cellAt(offsetPosition(origin, i * 40, i * 7));
    if (cellRichness(cell, period, 'green', 'timber') === 1) return cell;
  }
  throw new Error('No richness 1 cell found');
};

const campIn = (cell: string): Camp => ({
  id: 'c1',
  kind: 'timber',
  cell,
  terrain: 'green',
  foundedAt: Date.now(),
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
});

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe('the Network tab', () => {
  afterEach(() => {
    useSettingsStore.setState({ supplyLines: false });
    act(() => renderer?.unmount());
  });
  let renderer: ReactTestRenderer | null = null;

  it('shows the empty state: no hall, no camps, and a parked cart with no route', () => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save: createInitialSave() });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('No hall yet');
    expect(tab).toContain('Walk to good ground and found a camp');
    expect(tab).toContain('Parked at the hall.');
    expect(tab).toContain('No route yet: plan one on the map.');
  });

  it('shows a camp card: its rate, stock against the cap, and collecting in person', () => {
    useSettingsStore.setState({ supplyLines: true });
    const cell = richnessOneCell();
    const save: SaveData = { ...createInitialSave(), supply: { ...createInitialSave().supply, camps: [campIn(cell)] } };
    act(() => {
      useGameStore.setState({ save });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('Timber camp');
    expect(tab).toContain('0.4 wood an hour');
    expect(tab).toContain('0 / 12');
    expect(tab).toContain('Collect at the camp');
    expect(tab).toContain('Post a hero');
  });
});
