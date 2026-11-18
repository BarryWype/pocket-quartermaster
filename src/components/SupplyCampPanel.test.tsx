import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Building } from '@/game/supply/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';

import { SupplyCampPanel } from './SupplyCampPanel';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const origin = { latitude: -41.2865, longitude: 174.7762 };
const DAY = 24 * 3_600_000;

const buildingIn = (extra: Partial<Building> = {}): Building => ({
  id: 'b1',
  kind: 'herbGarden',
  siteId: 's1',
  position: origin,
  quality: 1,
  builtAt: Date.now(),
  expiresAt: Date.now() + 6 * DAY,
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
  ...extra,
});

const saveWithBuilding = (building: Building): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    heroes: base.heroes.map((h) => (h.id === 'bram' ? { ...h, trade: { id: 'herbalist', hours: 40 } } : h)),
    supply: { ...base.supply, buildings: [building] },
  };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe('the building sheet', () => {
  afterEach(() => {
    act(() => renderer?.unmount());
  });
  let renderer: ReactTestRenderer | null = null;

  it('shows a locals-only building: the flow row, the ember Post a hero, and the cart to add', () => {
    act(() => {
      useGameStore.setState({ save: saveWithBuilding(buildingIn()) });
    });
    act(() => {
      renderer = create(<SupplyCampPanel id="b1" player={origin} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    // The flow row reads left to right: locals at their share, the goods, the stock, who takes it home.
    expect(sheet).toContain('Locals 60%');
    expect(sheet).toContain('You collect');
    expect(sheet).toContain('0');
    expect(sheet).toContain('of 57');
    // One ember button a sheet: posting is the next step, so the cart's add stays wood.
    expect(sheet).toContain('Post a hero');
    expect(sheet).toContain('Add to the cart’s route');
    expect(sheet).toContain('Not on the cart’s route.');
    // The player stands at the building, but nothing has been made yet.
    expect(sheet).toContain('Nothing to collect yet');
    expect(sheet).not.toContain('Recall');
  });

  it('shows a posted building: the hero with their trade, the bonus rate, and Recall', () => {
    act(() => {
      useGameStore.setState({ save: saveWithBuilding(buildingIn({ heroId: 'bram', postedAt: Date.now() })) });
    });
    act(() => {
      renderer = create(<SupplyCampPanel id="b1" player={origin} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('Bram · Herbalist, level 2');
    // Quality 1 at the full rate with a level 2 Herbalist: 3.6 an hour, +50%.
    expect(sheet).toContain('Full rate +50%: 3.6 an hour');
    expect(sheet).toContain('Recall');
    expect(sheet).not.toContain('Post a hero');
  });

  it('warns in the last day: the ember strip, the lost stock, and the hero coming home', () => {
    act(() => {
      useGameStore.setState({
        save: saveWithBuilding(buildingIn({ heroId: 'bram', postedAt: Date.now(), expiresAt: Date.now() + 9 * 3_600_000, stock: { herb: 3 } })),
      });
    });
    act(() => {
      renderer = create(<SupplyCampPanel id="b1" player={origin} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('LAST DAY');
    expect(sheet).toContain('The herb garden leaves in');
    expect(sheet).toContain('Stock the cart hasn’t taken is lost.');
    expect(sheet).toContain('Bram comes home.');
    // Collecting before it is lost is the next step, so it is the sheet's ember button.
    expect(sheet).toContain('Collect 3 now');
  });
});
