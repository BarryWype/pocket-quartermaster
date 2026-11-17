import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { emptyLoot } from '@/game/loot/types';
import type { Order } from '@/game/supply/orders';
import { createInitialSave, type SaveData } from '@/game/save';
import type { Building } from '@/game/supply/types';
import { navigate } from '@/services/navigation';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore } from '@/store/worldStore';

import { NetworkTab } from './NetworkTab';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
jest.mock('@/services/navigation', () => ({ navigate: jest.fn() }));

const origin = { latitude: -41.2865, longitude: 174.7762 };
const DAY = 24 * 3_600_000;
const SITE_ID = 'place:site:s1';
const TAVERN_ID = 'place:tavern:t1';

const buildingIn = (id: string, quality: 1 | 2 | 3, daysLeft = 6, heroId: string | null = null): Building => ({
  id,
  kind: 'farm',
  siteId: SITE_ID,
  position: origin,
  quality,
  builtAt: Date.now() - (6 - daysLeft) * DAY,
  expiresAt: Date.now() + daysLeft * DAY,
  heroId,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
});

const orderFor = (placeId: string): Order => ({
  placeId,
  kind: 'tavern',
  wants: { grain: 10 },
  total: 10,
  delivered: {},
  goldFraction: 0,
  goldPaid: 0,
  steps: [0.25, 0.5, 1].map((at) => ({ at, reward: emptyLoot(), claimed: false })),
  headline: emptyLoot(),
  expiresAt: Date.now() + 6 * DAY,
});

/** A save whose chain is done and whose network runs: a hall, a farm on the discovered site, a live tavern order, a route and a driver. */
const runningSave = (buildings: Building[]): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    supply: {
      ...base.supply,
      hall: { cell: cellAt(origin), moves: [] },
      buildings,
      discovered: { [SITE_ID]: Date.now() + 6 * DAY, [TAVERN_ID]: Date.now() + 6 * DAY },
      orders: { [TAVERN_ID]: orderFor(TAVERN_ID) },
      cart: {
        ...base.supply.cart,
        route: [{ building: buildings[0].id }, { place: TAVERN_ID, position: origin }],
        crew: { driver: 'bram', escorts: [] },
      },
      firstChain: { step: 6, doneAt: Date.now() - 1 },
    },
  };
};

/** Every label the next-step card's button can carry; the steady card has none of them. */
const NEXT_BUTTON_LABELS = [
  'Answer the raid',
  'Show my cell',
  'Show the site',
  'Build',
  'Show the place',
  'Plan the route',
  'Crew the cart',
  'Post a hero',
  'Claim the reward',
];

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe('the Network tab', () => {
  afterEach(() => {
    useSettingsStore.setState({ supplyLines: false });
    act(() => renderer?.unmount());
  });
  let renderer: ReactTestRenderer | null = null;

  it('shows the empty state: the First steps checklist at step 0, the greyed flow, and no hall', () => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save: createInitialSave() });
    });
    act(() => {
      useWorldStore.setState({ player: origin });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('First steps');
    expect(tab).toContain('Place your hall');
    expect(tab).toContain('A building');
    expect(tab).toContain('Build on a site, then the cart carries what it makes to places that pay for it.');
    expect(tab).toContain('No hall yet');
    // The current step's button opens the player's own cell on the map.
    act(() => {
      renderer!.root.findByProps({ accessibilityLabel: 'Show my cell' }).props.onPress();
    });
    expect(useMapPanels.getState().supplyCell).toBe(cellAt(origin));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows the route step as the current one, with its button alone', () => {
    useSettingsStore.setState({ supplyLines: true });
    const base = createInitialSave();
    act(() => {
      useGameStore.setState({ save: { ...base, supply: { ...base.supply, firstChain: { step: 4, doneAt: null } } } });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('Set the cart’s route');
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Plan the route' }).length).toBeGreaterThan(0);
    // Only the current step carries a button.
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Show my cell' }).length).toBe(0);
  });

  it('shows the next step for a building worked by locals only', () => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save: runningSave([buildingIn('b1', 1)]) });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    expect(text(renderer!)).toContain('Post a hero at the Farm: it runs at 40%.');
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Post a hero' }).length).toBeGreaterThan(0);
  });

  it('shows the steady line and no next-step button when nothing is left to do', () => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save: runningSave([buildingIn('b1', 1, 6, 'bram')]) });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    expect(text(renderer!)).toContain('Your network runs on its own.');
    const buttons = renderer!.root.findAll(
      (node) => typeof node.props.onPress === 'function' && NEXT_BUTTON_LABELS.includes(node.props.accessibilityLabel),
    );
    expect(buttons.length).toBe(0);
  });

  it('collapses the flow picture past three buildings into a count', () => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({
        save: runningSave(['b1', 'b2', 'b3', 'b4'].map((id, i) => buildingIn(id, ((i % 3) + 1) as 1 | 2 | 3))),
      });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('+1');
    expect(tab).not.toContain('A building');
  });

  it('heads a last-day building with the Leaving soonest section, and does not repeat it below', () => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save: runningSave([buildingIn('b1', 1, 0.5)]) });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('Leaving soonest');
    // The badge marks the card once: in the section, not again in the buildings list.
    expect(tab.split('LAST DAY').length - 1).toBe(1);
  });

  it('opens a building’s sheet on the map when its card is tapped', () => {
    useSettingsStore.setState({ supplyLines: true });
    act(() => {
      useGameStore.setState({ save: runningSave([buildingIn('b1', 1)]) });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    act(() => {
      renderer!.root.findByProps({ accessibilityLabel: 'Farm' }).props.onPress();
    });
    expect(useMapPanels.getState().supplyBuilding).toBe('b1');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('warns when a stop on the cart’s route has left, and the button opens the planner on the map', () => {
    useSettingsStore.setState({ supplyLines: true });
    const save = runningSave([buildingIn('b1', 1)]);
    act(() => {
      useGameStore.setState({
        save: { ...save, supply: { ...save.supply, cart: { ...save.supply.cart, route: [{ building: 'gone' }] } } },
      });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    expect(text(renderer!)).toContain('A stop on the cart’s route has left. Set the route again.');
    act(() => {
      renderer!.root.findAll((node) => node.props.title === 'Set the route' && typeof node.props.onPress === 'function')[0].props.onPress();
    });
    expect(useMapPanels.getState().routePlanner).toEqual([{ building: 'gone' }]);
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
