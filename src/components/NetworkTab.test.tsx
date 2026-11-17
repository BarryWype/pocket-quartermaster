import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Building } from '@/game/supply/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore } from '@/store/worldStore';

import { NetworkTab } from './NetworkTab';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const origin = { latitude: -41.2865, longitude: 174.7762 };

const buildingIn = (quality: 1 | 2 | 3, daysLeft = 6): Building => ({
  id: 'b1',
  kind: 'farm',
  siteId: 's1',
  position: origin,
  quality,
  builtAt: Date.now() - (6 - daysLeft) * 24 * 3_600_000,
  expiresAt: Date.now() + daysLeft * 24 * 3_600_000,
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

  it('shows the empty state: no hall, no buildings, and a parked cart with no route', () => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save: createInitialSave() });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('No hall yet');
    expect(tab).toContain('Parked at the hall.');
    expect(tab).toContain('No route yet: plan one on the map.');
  });

  it('shows a building card: its stock against the cap and its time left, and a tap opens its sheet', () => {
    useSettingsStore.setState({ supplyLines: true });
    const save: SaveData = { ...createInitialSave(), supply: { ...createInitialSave().supply, buildings: [buildingIn(1)] } };
    act(() => {
      useGameStore.setState({ save });
      useWorldStore.setState({ player: origin });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('Farm');
    expect(tab).toContain('0 / 12');
    expect(tab).toContain('Leaves in');
    // The card's tap opens the building's sheet.
    act(() => {
      renderer!.root.findByProps({ accessibilityLabel: 'Farm' }).props.onPress();
    });
    expect(renderer!.root.findAll((node) => node.props.accessibilityLabel === 'Post a hero').length).toBeGreaterThan(0);
  });

  it('heads a last-day building with the Leaving soonest section, and does not repeat it below', () => {
    useSettingsStore.setState({ supplyLines: true });
    const save: SaveData = { ...createInitialSave(), supply: { ...createInitialSave().supply, buildings: [buildingIn(1, 0.5)] } };
    act(() => {
      useGameStore.setState({ save });
      useWorldStore.setState({ player: origin });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('Leaving soonest');
    expect(tab).toContain('LAST DAY');
    // The card appears once: in the section, not again in the buildings list.
    expect(tab.split('Leaves in').length - 1).toBe(1);
  });
});
