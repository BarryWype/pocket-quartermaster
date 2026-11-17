import { act, create } from 'react-test-renderer';

import { useExpeditionsRail } from './expeditions';
import { createInitialSave } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-pager-view', () => ({ __esModule: true, default: () => null }));

/** Renders the hook once and hands its result back. */
let probe: ReturnType<typeof create> | null = null;
function railOf(): { items: { key: string }[]; initial: string } {
  let rail: { items: { key: string }[]; initial: string } | null = null;
  const Probe = () => {
    rail = useExpeditionsRail();
    return null;
  };
  act(() => {
    probe?.unmount();
    probe = create(<Probe />);
  });
  return rail!;
}

describe('the Expeditions rail', () => {
  afterEach(() => {
    useSettingsStore.setState({ supplyLines: false });
    act(() => probe?.unmount());
  });

  it('has no Network tab while the switch is off, and one while it is on', () => {
    const base = createInitialSave();
    act(() => {
      useGameStore.setState({ save: { ...base, supply: { ...base.supply, debugUnlocked: true } } });
    });
    useSettingsStore.setState({ supplyLines: false });
    expect(railOf().items.map((item) => item.key)).toEqual(['places', 'out', 'jobs']);
    useSettingsStore.setState({ supplyLines: true });
    expect(railOf().items.map((item) => item.key)).toEqual(['places', 'out', 'jobs', 'network']);
  });
});
