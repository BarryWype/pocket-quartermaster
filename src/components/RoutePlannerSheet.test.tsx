import { Modal } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import type { Building } from '@/game/supply/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';

import { TOP_BAR_HEIGHT } from './MapTopBar';
import { RoutePlannerSheet } from './RoutePlannerSheet';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
// The library is native-bound; the components only need its map pieces to exist.
jest.mock('@maplibre/maplibre-react-native', () => ({ GeoJSONSource: () => null, Layer: () => null, Marker: () => null }));
// No street tiles: every leg falls back to a straight line, so the sheet is deterministic.
jest.mock('@/services/mapTiles', () => ({ walkableTiles: { load: () => Promise.resolve(null) } }));

const origin = { latitude: -41.2865, longitude: 174.7762 };
const hallCell = cellAt(origin);
const now = Date.now();

const buildingAt = (id: string, expiresAt: number, stock: Record<string, number>): Building => ({
  id,
  kind: 'farm',
  siteId: `s-${id}`,
  position: offsetPosition(origin, 400, 0),
  quality: 2,
  builtAt: now - 6 * 24 * 3_600_000,
  expiresAt,
  heroId: null,
  postedAt: null,
  stock,
  progress: 0,
  made: 0,
  settledAt: now,
  inspectedUntil: 0,
  closedUntil: 0,
});

/** A save with the hall at the origin and the given buildings. */
const saveWith = (buildings: Building[]): SaveData => {
  const base = createInitialSave();
  return { ...base, supply: { ...base.supply, hall: { cell: hallCell, moves: [] }, buildings } };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, title: string) =>
  renderer.root.findAll((node) => node.props.title === title && typeof node.props.onPress === 'function');

/** Waits for the street path search, which runs off the press. */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
};

describe('the route planner sheet', () => {
  let renderer: ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => renderer?.unmount());
    act(() => useMapPanels.getState().closeRoutePlanner());
  });

  const open = (save: SaveData, seed: SaveData['supply']['cart']['route']) => {
    act(() => {
      useGameStore.setState({ save });
    });
    act(() => {
      useMapPanels.getState().openRoutePlanner(seed);
    });
    act(() => {
      renderer = create(<RoutePlannerSheet onClose={() => {}} />);
    });
    return renderer!;
  };

  it('step 1, nothing to pick: the banner says how to get a stop, and the sites button closes', async () => {
    let closed = false;
    act(() => {
      useGameStore.setState({ save: saveWith([]) });
    });
    act(() => {
      useMapPanels.getState().openRoutePlanner([]);
    });
    act(() => {
      renderer = create(<RoutePlannerSheet onClose={() => { closed = true; }} />);
    });
    await settle();
    const sheet = text(renderer!);
    expect(sheet).toContain('No stops yet. Build on a site, or walk to a tavern, smithy, apothecary or market');
    expect(sheet).toContain('Show sites near me');
    // Nothing picked: the next step stays off with its reason.
    expect(button(renderer!, 'Next: order').every((node) => node.props.disabled)).toBe(true);
    expect(sheet).toContain('Pick at least one building or place.');
    act(() => {
      button(renderer!, 'Show sites near me')[0].props.onPress();
    });
    expect(closed).toBe(true);
  });

  it('step 1 with a stop: what the building gives and how long it stays, and a tap picks it', () => {
    open(saveWith([buildingAt('b1', now + 3 * 24 * 3_600_000 + 3_600_000, { grain: 12 })]), []);
    const sheet = text(renderer!);
    expect(sheet).toContain('Farm ★★☆');
    expect(sheet).toContain('Gives');
    expect(sheet).toContain('12');
    expect(sheet).toContain('3 d');
    expect(button(renderer!, 'Next: order').every((node) => node.props.disabled)).toBe(true);
    act(() => {
      renderer!.root.findByProps({ accessibilityLabel: 'Farm ★★☆' }).props.onPress();
    });
    expect(button(renderer!, 'Next: order').every((node) => node.props.disabled)).toBe(false);
  });

  it('step 3: the flow strip, the loop’s numbers, and the warning for a stop leaving before the next loop ends', async () => {
    open(saveWith([buildingAt('b1', now + 3 * 60_000, { grain: 12 })]), [{ building: 'b1' }]);
    act(() => {
      button(renderer!, 'Next: order')[0].props.onPress();
    });
    act(() => {
      button(renderer!, 'Next: result')[0].props.onPress();
    });
    // The street search runs off the press; with no tiles every leg falls back to a straight line.
    await settle();
    const sheet = text(renderer!);
    expect(sheet).toContain('Farm');
    expect(sheet).toContain('▲ 12');
    expect(sheet).toContain('min a loop');
    expect(sheet).toContain('along streets');
    expect(sheet).toContain('ambush a loop');
    // The building leaves within the loop after next: the red banner says so.
    expect(sheet).toContain('leaves in');
    expect(sheet).toContain('Then the cart skips it.');
    // No street tiles: every leg is straight, and the sheet says so.
    expect(sheet).toContain('No street from');
    expect(sheet).toContain('the cart cuts across');
    expect(button(renderer!, 'Set the route').every((node) => node.props.disabled)).toBe(false);
  });

  /** Opens the planner on the farm and walks it to the result step. */
  const toResult = async () => {
    open(saveWith([buildingAt('b1', now + 3 * 24 * 3_600_000, { grain: 12 })]), [{ building: 'b1' }]);
    act(() => {
      button(renderer!, 'Next: order')[0].props.onPress();
    });
    act(() => {
      button(renderer!, 'Next: result')[0].props.onPress();
    });
    await settle();
  };
  const routeSet = () => {
    const { cart } = useGameStore.getState().save.supply;
    return cart.nextRoute ?? cart.route;
  };
  const tapNearFarm = async () => {
    act(() => {
      useMapPanels.getState().tapMap(offsetPosition(origin, 200, 0));
    });
    await settle();
  };

  it('closes every other map sheet when it opens', () => {
    const panels = useMapPanels.getState();
    const site = { id: 'site:x', kind: 'site' } as never;
    act(() => {
      panels.openSupplyBuilding('b1');
      panels.openSite(site);
      panels.openPlace(site);
      panels.openCart();
      panels.openRoutePlanner([]);
    });
    const state = useMapPanels.getState();
    expect(state.routePlanner).toEqual([]);
    expect([state.supplyBuilding, state.hallCell, state.site, state.place, state.sanctum, state.tavern, state.patrol]).toEqual([null, null, null, null, null, null, null]);
    expect(state.cartOpen).toBe(false);
  });

  it('is a bottom sheet in its own modal, so its footer sits above the island menu, and a backdrop tap closes it', () => {
    const onClose = jest.fn();
    act(() => {
      useGameStore.setState({ save: saveWith([buildingAt('b1', now + 3 * 24 * 3_600_000, {})]) });
    });
    act(() => {
      renderer = create(<RoutePlannerSheet onClose={onClose} />);
    });
    // The modal covers the whole screen, the island menu included; the footer's buttons are inside it.
    const modal = renderer!.root.findByType(Modal);
    expect(modal.findAll((node) => node.props.title === 'Next: order').length).toBeGreaterThan(0);
    // The dimmed backdrop behind the sheet (the step's Cancel button calls onClose too).
    const backdrop = modal.findAll((node) => node.props.onPress === onClose && JSON.stringify(node.props.style ?? null).includes('rgba(0,0,0,0.4)'), { deep: false });
    expect(backdrop).toHaveLength(1);
    act(() => {
      backdrop[0].props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('turns a map tap into a via point only while adjusting on the map', async () => {
    await toResult();
    // On the full sheet a map tap adds nothing.
    await tapNearFarm();
    expect(useMapPanels.getState().plannerTap).toBeNull();
    // Adjust on the map: the sheet becomes a bar at the top, under the top bar (clear of the walk pills at the bottom), and a tap adds a via point.
    act(() => {
      button(renderer!, 'Adjust on the map')[0].props.onPress();
    });
    expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
    expect(text(renderer!)).toContain('Tap a street to route through it');
    const bar = renderer!.root.findAll((node) => node.props.style && JSON.stringify(node.props.style).includes(`"top":${TOP_BAR_HEIGHT + 8}`));
    expect(bar.length).toBeGreaterThan(0);
    const before = useMapPanels.getState().plannerPath;
    expect(before).not.toBeNull();
    await tapNearFarm();
    await settle();
    // The map draws the route being planned: the via point changes it at once, before Done.
    expect(useMapPanels.getState().plannerPath).not.toBe(before);
    act(() => {
      button(renderer!, 'Done')[0].props.onPress();
    });
    await settle();
    expect(renderer!.root.findAllByType(Modal)).toHaveLength(1);
    act(() => {
      button(renderer!, 'Set the route')[0].props.onPress();
    });
    expect(routeSet().some((point) => 'via' in point)).toBe(true);
  });

  it('drops the via points of an adjustment cancelled', async () => {
    await toResult();
    act(() => {
      button(renderer!, 'Adjust on the map')[0].props.onPress();
    });
    await tapNearFarm();
    act(() => {
      button(renderer!, 'Cancel')[0].props.onPress();
    });
    await settle();
    act(() => {
      button(renderer!, 'Set the route')[0].props.onPress();
    });
    expect(routeSet().some((point) => 'via' in point)).toBe(false);
  });
});
