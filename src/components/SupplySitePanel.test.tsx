import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import type { PlaceSpawn } from '@/game/places/generate';
import { createInitialSave, type SaveData } from '@/game/save';
import { formatDistance } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useSettingsStore } from '@/store/settingsStore';

import { SupplySitePanel } from './SupplySitePanel';
import { TimerStrip } from './TimerStrip';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const origin = { latitude: -41.2865, longitude: 174.7762 };
const DAY = 24 * 3_600_000;

const siteIn = (extra: Partial<PlaceSpawn> = {}): PlaceSpawn => ({
  id: 'site:test:1',
  kind: 'site',
  group: 'site',
  tile: 'test',
  position: origin,
  startsAt: Date.now() - 1000,
  expiresAt: Date.now() + 5 * DAY,
  roll: 0.1,
  ...extra,
});

/** A save that can build: a hall within reach, the fee in the purse, the site discovered. */
const saveReadyToBuild = (site: PlaceSpawn): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    gold: 100,
    materials: { ...base.materials, wood: 10 },
    supply: {
      ...base.supply,
      hall: { cell: cellAt(offsetPosition(origin, 300, 0)), moves: [] },
      discovered: { [site.id]: site.expiresAt },
    },
  };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe('the site sheet', () => {
  afterEach(() => {
    useSettingsStore.setState({ supplyLines: false, haptics: false });
    useMapPanels.setState({ site: null, supplyBuilding: null });
    act(() => renderer?.unmount());
  });
  let renderer: ReactTestRenderer | null = null;

  it('shows only the walk hint and the distances while undiscovered', () => {
    useSettingsStore.setState({ supplyLines: true, haptics: false });
    const site = siteIn();
    act(() => {
      useGameStore.setState({ save: createInitialSave() });
    });
    act(() => {
      renderer = create(<SupplySitePanel site={site} player={origin} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('Empty site');
    expect(sheet).toContain('Not visited');
    expect(sheet).toContain('Walk here to discover it.');
    expect(sheet).toContain('You’ll see how good it is and what you can build.');
    expect(sheet).toContain('Leaves in');
    // No stars, no buildings, no costs before the ground is known.
    expect(sheet).not.toContain('Build');
    expect(sheet).not.toContain('★');
  });

  it('shows a discovered site with its quality and builds the chosen kind', () => {
    useSettingsStore.setState({ supplyLines: true, haptics: false });
    const site = siteIn();
    act(() => {
      useGameStore.setState({ save: saveReadyToBuild(site) });
    });
    act(() => {
      renderer = create(<SupplySitePanel site={site} player={origin} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('Site');
    expect(sheet).toContain('Poor ground: 1 star of 3');
    expect(sheet).toContain(`Buildings near the hall: 0 of 3 within ${formatDistance(1000)}`);
    // One card per kind, each saying who wants its goods.
    for (const name of ['Farm', 'Quarry', 'Herb garden']) expect(sheet).toContain(name);
    for (const who of ['Taverns', 'Smithies', 'Apothecaries']) expect(sheet).toContain(who);
    expect(sheet).toContain('with a hero');

    // The second tap, on the quarry's Build, raises it: the fee leaves the purse and the sheet swaps.
    act(() => {
      renderer!.root.findAll((node) => node.props.title === 'Build' && typeof node.props.onPress === 'function')[1].props.onPress();
    });
    const save = useGameStore.getState().save;
    expect(save.supply.buildings).toHaveLength(1);
    expect(save.supply.buildings[0].kind).toBe('quarry');
    expect(save.gold).toBe(40);
    expect(useMapPanels.getState().site).toBeNull();
    expect(useMapPanels.getState().supplyBuilding).toBe(save.supply.buildings[0].id);
  });

  it('blocks every building with one banner, and says the walk under buttons it only stops', () => {
    useSettingsStore.setState({ supplyLines: true, haptics: false });
    const site = siteIn();
    // No hall: one reason stops every kind, so the banner says it once.
    act(() => {
      useGameStore.setState({ save: { ...createInitialSave(), supply: { ...createInitialSave().supply, discovered: { [site.id]: site.expiresAt } } } });
    });
    act(() => {
      renderer = create(<SupplySitePanel site={site} player={origin} onClose={() => {}} />);
    });
    let sheet = text(renderer!);
    expect(sheet).toContain('Place your hall first.');

    // With a hall but the player away, only the walk stops each kind: a reason line, no banner.
    const away = offsetPosition(origin, 120, 0);
    act(() => {
      useGameStore.setState({ save: saveReadyToBuild(site) });
    });
    act(() => {
      renderer = create(<SupplySitePanel site={site} player={away} onClose={() => {}} />);
    });
    sheet = text(renderer!);
    expect(sheet).toContain(`Walk to the site to build (${formatDistance(120)}).`);
    expect(sheet).not.toContain('Place your hall first.');
  });
});

describe('the timer strip', () => {
  afterEach(() => act(() => renderer?.unmount()));
  let renderer: ReactTestRenderer | null = null;

  it('says LAST DAY only within its last day', () => {
    act(() => {
      renderer = create(<TimerStrip expiresAt={Date.now() + 2 * 3_600_000} />);
    });
    expect(text(renderer!)).toContain('LAST DAY');
    act(() => {
      renderer = create(<TimerStrip expiresAt={Date.now() + 3 * DAY} />);
    });
    expect(text(renderer!)).not.toContain('LAST DAY');
  });
});
