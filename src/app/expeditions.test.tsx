import { act, create } from 'react-test-renderer';

import { useExpeditionsRail } from './expeditions';
import { createInitialSave } from '@/game/save';
import { useGameStore } from '@/store/gameStore';

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
    act(() => probe?.unmount());
  });

  it('has no Network tab while the network is locked, and one once it opens', () => {
    const base = createInitialSave();
    act(() => {
      useGameStore.setState({ save: base });
    });
    expect(railOf().items.map((item) => item.key)).toEqual(['places', 'out', 'jobs']);
    act(() => {
      useGameStore.setState({ save: { ...base, supply: { ...base.supply, debugUnlocked: true } } });
    });
    expect(railOf().items.map((item) => item.key)).toEqual(['places', 'out', 'jobs', 'network']);
  });
});
