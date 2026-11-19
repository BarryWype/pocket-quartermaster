import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { offsetPosition } from '@/game/generation/geo';
import type { PlaceSpawn } from '@/game/places/generate';
import { placeStock } from '@/game/places/shops';
import { createInitialSave } from '@/game/save';
import type { TavernSpawn } from '@/game/taverns/taverns';
import { useGameStore } from '@/store/gameStore';

import { PlaceFightPanel } from './PlaceFightPanel';
import { PlacePanel } from './PlacePanel';
import { SecretPanel } from './SecretPanel';
import { TavernPanel } from './TavernPanel';

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

  it('a smithy shows its stock 320 m away, its Buy buttons saying how far to walk; here they say Buy', () => {
    const smithy = spawn('smithy');
    const stock = placeStock(useGameStore.getState().save, smithy, now);
    expect(stock.length).toBeGreaterThan(0);
    act(() => {
      renderer = create(<PlacePanel place={smithy} player={far} now={now} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).not.toContain('too far to see');
    expect(sheet).toContain(`320${NBSP}m away`);
    expect(sheet).toContain('Sells and buys gear');
    const walk = titles(renderer!).filter((title) => title === `Walk 320${NBSP}m to buy`);
    expect(walk).toHaveLength(stock.length);
    act(() => renderer!.unmount());
    act(() => {
      renderer = create(<PlacePanel place={smithy} player={near} now={now} onClose={() => {}} />);
    });
    // One Buy per line, and the Buy tab beside Sell.
    expect(titles(renderer!).filter((title) => title === 'Buy')).toHaveLength(stock.length + 1);
    expect(text(renderer!)).not.toContain('m away');
  });

  it('a chapel shows its care and blessing from afar, locked with the walk', () => {
    act(() => {
      renderer = create(<PlacePanel place={spawn('chapel')} player={far} now={now} onClose={() => {}} />);
    });
    expect(text(renderer!)).toContain('Care for a hero at home');
    expect(titles(renderer!)).toContain(`Walk 320${NBSP}m to take the blessing`);
  });

  it('a tavern shows its recruits from afar, without a separate “get within” line', () => {
    const tavern: TavernSpawn = { ...spawn('tavern'), name: 'The Crooked Mug' };
    act(() => {
      renderer = create(<TavernPanel tavern={tavern} player={far} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('Emergency supply');
    expect(sheet).not.toContain('Get within');
    expect(titles(renderer!)).toContain(`Walk 320${NBSP}m to buy`);
  });

  it('a fight shows its foes from afar, and Fight says how far to walk', () => {
    act(() => {
      renderer = create(<PlaceFightPanel place={spawn('banditCamp')} player={far} now={now} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('Foes');
    expect(sheet).toContain('Bandits with stolen goods.');
    expect(titles(renderer!)).toContain(`Walk 320${NBSP}m to fight`);
  });

  it('a secret place keeps its offer behind the key, from afar as here', () => {
    act(() => {
      renderer = create(<SecretPanel place={spawn('blackMarket')} player={far} now={now} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('A rare hero and goods no shop sells.');
    // Not entered: no recruit, no goods.
    expect(sheet).not.toContain('Goods');
    expect(titles(renderer!)).not.toContain('Recruit');
  });
});
