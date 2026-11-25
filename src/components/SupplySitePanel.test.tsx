import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import type { PlaceSpawn } from '@/game/places/generate';
import { createInitialSave, type SaveData } from '@/game/save';
import { formatDistance } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useSettingsStore } from '@/store/settingsStore';

import { sheetKit } from './network/sheetTestKit';
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
    useSettingsStore.setState({ haptics: false });
    useMapPanels.setState({ site: null, supplyBuilding: null });
    act(() => renderer?.unmount());
    renderer = null;
  });
  let renderer: ReactTestRenderer | null = null;
  const kit = sheetKit(() => renderer!);
  const open = (save: SaveData, site: PlaceSpawn, player = origin) => {
    act(() => {
      useGameStore.setState({ save });
    });
    act(() => {
      renderer = create(<SupplySitePanel site={site} player={player} onClose={() => {}} />);
    });
  };

  it('undiscovered: says to walk there, and the main action is the walk', () => {
    useSettingsStore.setState({ haptics: false });
    const site = siteIn();
    open(createInitialSave(), site, offsetPosition(origin, 320, 0));
    const sheet = kit.text();
    expect(sheet).toContain('Walk here to see how good the ground is and what you can build.');
    expect(sheet).toContain('leaves in');
    expect(kit.titles()).toContain(`Walk ${formatDistance(320)} to discover it`);
    // No stars, no buildings, no costs before the ground is known.
    expect(sheet).not.toContain('Build');
    expect(sheet).not.toContain('★');
  });

  it('discovered: the ground and the picked kind in the summary; the Build tab picks and builds', () => {
    useSettingsStore.setState({ haptics: false });
    const site = siteIn();
    open(saveReadyToBuild(site), site);
    expect(kit.text()).toContain('★☆☆');
    expect(kit.text()).toContain('Poor ground · a ');
    kit.press('See what you can build');
    // One tile per open kind; the mines and the kiln open at later tiers.
    for (const name of ['Farm', 'Herb garden', 'Quarry', 'Lumber camp', 'Hunting camp']) expect(kit.text()).toContain(name);
    expect(kit.text()).not.toContain('Copper mine');

    // Picking the quarry turns the main action into building it; pressing it raises it and opens its sheet.
    act(() => {
      renderer!.root.findAll((node) => node.props?.accessibilityRole === 'radio' && String(node.props?.accessibilityLabel).startsWith('Quarry'))[0].props.onPress();
    });
    kit.press('Build a Quarry');
    const save = useGameStore.getState().save;
    expect(save.supply.buildings).toHaveLength(1);
    expect(save.supply.buildings[0].kind).toBe('quarry');
    expect(save.gold).toBe(40);
    expect(useMapPanels.getState().site).toBeNull();
    expect(useMapPanels.getState().supplyBuilding).toBe(save.supply.buildings[0].id);
  });

  it('a rule that holds anywhere locks the button with its reason; away, the button walks', () => {
    useSettingsStore.setState({ haptics: false });
    const site = siteIn();
    open({ ...createInitialSave(), supply: { ...createInitialSave().supply, discovered: { [site.id]: site.expiresAt } } }, site, offsetPosition(origin, 120, 0));
    expect(kit.titles()).toContain('Place your hall first');

    act(() => renderer!.unmount());
    open(saveReadyToBuild(site), site, offsetPosition(origin, 120, 0));
    expect(kit.titles().some((title) => title === `Walk ${formatDistance(120)} to build`)).toBe(true);
    expect(kit.text()).not.toContain('Place your hall first');
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
    // Unmounted before the second mounts: a leaked strip keeps ticking its
    // 10-second clock past the suite, and the worker blames this file for it.
    act(() => {
      renderer!.unmount();
      renderer = create(<TimerStrip expiresAt={Date.now() + 3 * DAY} />);
    });
    expect(text(renderer!)).not.toContain('LAST DAY');
  });
});
