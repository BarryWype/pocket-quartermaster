import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import { createInitialSave, type SaveData } from '@/game/save';
import { emptySupply } from '@/game/supply/state';
import type { Raid } from '@/game/supply/types';
import { useCartTick } from '@/hooks/useCartTick';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

import { RaidBanner } from './RaidBanner';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const HOUR = 3_600_000;
const origin = { latitude: -41.2865, longitude: 174.7762 };

/** A hall, a stocked farm 800 m away, and a raid on it landing in `landsIn`. */
const raided = (landsIn: number, extra: Partial<Raid> = {}): SaveData => {
  const now = Date.now();
  const base = createInitialSave();
  return {
    ...base,
    supply: {
      ...emptySupply(now),
      hall: { cell: cellAt(origin), moves: [] },
      buildings: [
        {
          id: 'b1',
          kind: 'farm',
          siteId: 's1',
          position: offsetPosition(origin, 800, 0),
          quality: 2,
          builtAt: 0,
          expiresAt: now + 6 * 24 * HOUR,
          heroId: null,
          postedAt: null,
          stock: { grain: 5 },
          progress: 0,
          made: 0,
          settledAt: now,
          inspectedUntil: 0,
          closedUntil: 0,
        },
      ],
      raid: { buildingId: 'b1', kind: 'goblins', tier: 1, landsAt: now + landsIn, defenders: [], result: null, ...extra },
    },
  };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe('the raid banner', () => {
  let renderer: ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    useSettingsStore.setState({ supplyLines: false });
  });

  const mount = (save: SaveData, buildingId?: string) => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save });
    });
    act(() => {
      renderer = create(<RaidBanner buildingId={buildingId} />);
    });
    return renderer!;
  };

  it('shows an announced raid: who, which building, nobody guarding, and Defend', () => {
    const banner = text(mount(raided(HOUR)));
    expect(banner).toContain('farm');
    expect(banner).toContain('Nobody guards it');
    expect(banner).toContain('Defend');
  });

  it('shows defenders on their way', () => {
    const now = Date.now();
    const banner = text(mount(raided(HOUR, { defenders: [{ heroId: 'bram', sentAt: now, arrivesAt: now + 10 * 60_000 }] })));
    expect(banner).toContain('Bram arrives in');
  });

  it('shows nothing before the announcement', () => {
    expect(mount(raided(5 * HOUR)).toJSON()).toBeNull();
  });

  it('only shows on the raided camp’s own sheet', () => {
    expect(mount(raided(HOUR), 'other').toJSON()).toBeNull();
  });
});

describe('the supply tick', () => {
  function Probe() {
    useCartTick();
    return null;
  }
  let renderer: ReactTestRenderer | null = null;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    useSettingsStore.setState({ supplyLines: false });
    jest.useRealTimers();
  });

  it('waits for a pending raid even with the cart parked', () => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save: raided(HOUR) });
    });
    act(() => {
      renderer = create(<Probe />);
    });
    expect(jest.getTimerCount()).toBe(1);
  });
});
