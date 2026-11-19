import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { offsetPosition } from '@/game/generation/geo';
import type { PlaceSpawn } from '@/game/places/generate';
import { placeStock } from '@/game/places/shops';
import { createInitialSave } from '@/game/save';
import type { TavernSpawn } from '@/game/taverns/taverns';
import { useGameStore } from '@/store/gameStore';

import { PlaceFightSheet } from './fights/PlaceFightSheet';
import { PlaceSheet } from './places/PlaceSheet';
import { TavernSheet } from './places/TavernSheet';
import { SecretSheet } from './places/SecretSheet';
import { ItemSlot } from './ui';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const NBSP = ' ';
const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.now();
const far = offsetPosition(origin, 320, 0);
const near = offsetPosition(origin, 10, 0);

const spawn = (kind: PlaceSpawn['kind'], id = `${kind}-1`): PlaceSpawn => ({
  id,
  kind,
  group: 'g',
  tile: 't',
  position: origin,
  startsAt: now - 3_600_000,
  expiresAt: now + 2 * 3_600_000,
  roll: 0.3,
});

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const titles = (renderer: ReactTestRenderer) =>
  renderer.root.findAll((node) => typeof node.props.title === 'string' && typeof node.props.onPress === 'function').map((node) => node.props.title as string);

describe('map sheets show what is there from afar', () => {
  let renderer: ReactTestRenderer | null = null;
  beforeEach(() => {
    act(() => {
      useGameStore.setState({ save: { ...createInitialSave(), gold: 5000 } });
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
  });

  const press = (title: string) => {
    const node = renderer!.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
    act(() => node.props.onPress());
  };
  /** The shop's tiles: the item slots that can be tapped. */
  const tiles = () => renderer!.root.findAllByType(ItemSlot).filter((node) => typeof node.props.onPress === 'function');

  it('a smithy shows its stock 320 m away as tiles; the one action is the walk, and here it is Buy', () => {
    const smithy = spawn('smithy');
    const stock = placeStock(useGameStore.getState().save, smithy, now);
    expect(stock.length).toBeGreaterThan(0);
    act(() => {
      renderer = create(<PlaceSheet place={smithy} player={far} now={now} onClose={() => {}} />);
    });
    expect(text(renderer!)).not.toContain('too far to see');
    expect(text(renderer!)).toContain(`320${NBSP}m away`);
    expect(text(renderer!)).toContain('Sells and buys gear');
    expect(titles(renderer!)).toContain(`Walk 320${NBSP}m to trade`);
    // The full sheet shows every line as a tile, with its price, from afar.
    press('More');
    expect(tiles()).toHaveLength(stock.length);
    act(() => renderer!.unmount());
    act(() => {
      renderer = create(<PlaceSheet place={smithy} player={near} now={now} onClose={() => {}} />);
    });
    expect(titles(renderer!)).toContain('Buy');
    expect(text(renderer!)).not.toContain('m away');
  });

  it('a chapel shows its blessing from afar, locked with the walk', () => {
    act(() => {
      renderer = create(<PlaceSheet place={spawn('chapel')} player={far} now={now} onClose={() => {}} />);
    });
    expect(text(renderer!)).toContain('party damage on your next expedition');
    expect(titles(renderer!)).toContain(`Walk 320${NBSP}m to take the blessing`);
  });

  it('a tavern shows its recruits from afar, and its emergency supply in the Buy tab, locked with its reason', () => {
    const tavern: TavernSpawn = { ...spawn('tavern'), name: 'The Crooked Mug' };
    act(() => {
      renderer = create(<TavernSheet tavern={tavern} player={far} now={now} onClose={() => {}} />);
    });
    expect(text(renderer!)).toContain('recruits today');
    expect(text(renderer!)).not.toContain('Get within');
    expect(titles(renderer!)).toContain(`Walk 320${NBSP}m to recruit`);
    press('More');
    const buyTab = renderer!.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === 'Buy' && typeof n.props.onPress === 'function')[0];
    act(() => buyTab.props.onPress());
    expect(text(renderer!)).toContain('Emergency supply');
    // A new save can't recruit or buy supply yet: the supply's button says so; the footer still says the walk.
    expect(titles(renderer!)).toEqual(expect.arrayContaining(['Beat the Bandit Stockade first', `Walk 320${NBSP}m to trade`]));
  });

  it('a fight shows its foes from afar, and Fight says how far to walk', () => {
    act(() => {
      renderer = create(<PlaceFightSheet place={spawn('banditCamp')} player={far} now={now} onClose={() => {}} />);
    });
    // The peek names the foes, their threats and what they drop; the full sheet tells the rest.
    expect(text(renderer!)).toContain('3 foes: cutpurse, bandit, bandit archer');
    expect(text(renderer!)).toContain('Drops: Gold');
    expect(titles(renderer!)).toContain(`Walk 320${NBSP}m to fight`);
    press('More');
    expect(text(renderer!)).toContain('cutpurse');
    const details = renderer!.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === 'Details' && typeof n.props.onPress === 'function')[0];
    act(() => details.props.onPress());
    expect(text(renderer!)).toContain('Bandits with stolen goods.');
  });

  it('a secret place keeps its offer behind the key, from afar as here', () => {
    act(() => {
      renderer = create(<SecretSheet place={spawn('blackMarket')} player={far} now={now} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('A rare hero and goods no shop sells.');
    // Not entered: no recruit, no goods.
    expect(sheet).not.toContain('Goods');
    expect(titles(renderer!)).not.toContain('Recruit');
  });
});
