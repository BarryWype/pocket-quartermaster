import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { emptyLoot } from '@/game/loot/types';
import type { Order } from '@/game/supply/orders';
import { createInitialSave, type SaveData } from '@/game/save';
import type { Building } from '@/game/supply/types';
import { navigate } from '@/services/navigation';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
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
  'Plan the delivery route',
  'Crew the cart',
  'Post a hero',
  'Claim the reward',
];

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe('the Network tab', () => {
  afterEach(() => {
    act(() => renderer?.unmount());
  });
  let renderer: ReactTestRenderer | null = null;

  it('shows the empty state: the First steps checklist at step 0, the greyed flow, and no hall', () => {
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
    // The current step's button places the hall in the player's own cell, right here.
    act(() => {
      renderer!.root.findAllByProps({ accessibilityLabel: 'Place hall here' })[0].props.onPress();
    });
    expect(useGameStore.getState().save.supply.hall?.cell).toBe(cellAt(origin));
  });

  it('shows the route step as the current one, with its button alone', () => {
    const base = createInitialSave();
    act(() => {
      useGameStore.setState({ save: { ...base, supply: { ...base.supply, firstChain: { step: 4, doneAt: null } } } });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    const tab = text(renderer!);
    expect(tab).toContain('Plan the delivery route');
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Plan the delivery route' }).length).toBeGreaterThan(0);
    // Only the current step carries a button.
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Place hall here' }).length).toBe(0);
  });

  it('shows the next step for a building worked by locals only', () => {
    act(() => {
      useGameStore.setState({ save: runningSave([buildingIn('b1', 1)]) });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    expect(text(renderer!)).toContain('Post a hero at the Farm: it runs at 60%.');
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Post a hero' }).length).toBeGreaterThan(0);
  });

  it('shows the steady line and no next-step button when nothing is left to do', () => {
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

  /** The picture draws once it knows its width: the test renderer runs no layout, so it is given one. */
  const layOut = () =>
    act(() => {
      renderer!.root
        .findAll((node) => typeof node.props?.onLayout === 'function' && node.props.style?.[0]?.position === 'relative')[0]
        .props.onLayout({ nativeEvent: { layout: { width: 340, height: 200, x: 0, y: 0 } } });
    });
  const labelled = (start: string) =>
    renderer!.root.findAll((node) => typeof node.props?.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(start) && typeof node.props.onPress === 'function')[0];

  it('draws the network: what each building holds and where it goes, what each place wants and from whom', () => {
    act(() => {
      useGameStore.setState({ save: runningSave([buildingIn('b1', 2), { ...buildingIn('b2', 1), kind: 'quarry' }]) });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    layOut();
    // Every number with its unit and meaning; each item says in words what its lines show.
    expect(labelled('Farm, 0 of').props.accessibilityLabel).toMatch(/^Farm, 0 of \d+ stored, goes to /);
    expect(labelled('Quarry').props.accessibilityLabel).toContain('nothing nearby wants what it makes yet');
    const tavern = renderer!.root.findAll(
      (node) => typeof node.props?.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('wants 10 grain') && typeof node.props.onPress === 'function',
    )[0];
    expect(tavern.props.accessibilityLabel).toContain('gets it from Farm');
    expect(text(renderer!)).toContain('carried by the delivery route');

    // A tap on a building opens its sheet on the map; a tap on the cart opens route mode with the route.
    act(() => labelled('Farm, 0 of').props.onPress());
    expect(useMapPanels.getState().supplyBuilding).toBe('b1');
    act(() => labelled('The cart,').props.onPress());
    expect(useMapPanels.getState().routeMode?.draft).toEqual([{ building: 'b1' }, { place: TAVERN_ID, position: origin }]);
    expect(navigate).toHaveBeenCalledWith('/');
    act(() => useMapPanels.getState().closeRouteMode());
  });

  it('leaves what doesn’t fit the picture to the cards below, and says how many', () => {
    act(() => {
      useGameStore.setState({
        save: runningSave(['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((id, i) => buildingIn(id, ((i % 3) + 1) as 1 | 2 | 3))),
      });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    layOut();
    const tab = text(renderer!);
    expect(tab).toContain('+1 more below');
    expect(tab).not.toContain('A building');
  });

  it('heads a last-day building with the Leaving soonest section, and does not repeat it below', () => {
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

  it('warns when a stop on the delivery route has left, and the button opens the planner on the map', () => {
    const save = runningSave([buildingIn('b1', 1)]);
    act(() => {
      useGameStore.setState({
        save: { ...save, supply: { ...save.supply, cart: { ...save.supply.cart, route: [{ building: 'gone' }] } } },
      });
    });
    act(() => {
      renderer = create(<NetworkTab />);
    });
    expect(text(renderer!)).toContain('A stop on the delivery route has left. Edit the route again.');
    act(() => {
      renderer!.root.findAll((node) => node.props.title === 'Edit the delivery route' && typeof node.props.onPress === 'function')[0].props.onPress();
    });
    expect(useMapPanels.getState().routeMode?.draft).toEqual([{ building: 'gone' }]);
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
