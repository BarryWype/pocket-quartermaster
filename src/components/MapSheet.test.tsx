import { Profiler } from 'react';
import { Modal } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { offsetPosition } from '@/game/generation/geo';
import { mainAction } from '@/game/places/mainAction';
import { formatTimeLeft } from '@/i18n';
import { useGameStore } from '@/store/gameStore';

import { MapSheet, mapSheetStatus, type MapSheetAction, type MapSheetTab } from './MapSheet';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const NBSP = ' ';
const place = { latitude: -41.2865, longitude: 174.7762 };
const at = (meters: number) => offsetPosition(place, meters, 0);

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const buttons = (renderer: ReactTestRenderer, title: string) =>
  renderer.root.findAll((node) => node.props.title === title && typeof node.props.onPress === 'function');
const tab = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.find((node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');

const tabs: MapSheetTab[] = [
  { key: 'buy', label: 'Buy · Sell', render: () => <>{'Iron sword on the shelf'}</> },
  { key: 'order', label: 'Order · 40%', render: () => <>{'Wants stone and wood'}</> },
  { key: 'details', label: 'Details', render: () => <>{'Sells and buys gear'}</> },
];

const shopAction = (meters: number, onPress = jest.fn(), onWalk = jest.fn(), problem: 'gold' | null = null): MapSheetAction => ({
  state: mainAction({ player: at(meters), target: place, range: 50, problem }),
  verb: 'trade',
  label: 'Buy',
  blockedLabel: 'Not enough gold',
  onPress,
  onWalk,
});

describe('the map sheet template', () => {
  let renderer: ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
  });

  const render = (props: Partial<Parameters<typeof MapSheet>[0]> = {}) => {
    const all: Parameters<typeof MapSheet>[0] = {
      onClose: () => {},
      emoji: '⚒️',
      ring: { kind: 'time', left: 0.6, last: false },
      title: 'Smithy',
      status: 'You’re here · leaves in 2 h',
      summary: <>{'Sells 3 pieces and a helm blueprint'}</>,
      action: shopAction(10),
      tabs,
      ...props,
    };
    act(() => {
      renderer = create(<MapSheet {...all} />);
    });
    return renderer!;
  };

  it('opens on the peek: header, status, summary and the main action, no tabs', () => {
    const sheet = text(render());
    expect(sheet).toContain('Smithy');
    expect(sheet).toContain('You’re here · leaves in 2 h');
    expect(sheet).toContain('Sells 3 pieces and a helm blueprint');
    expect(buttons(renderer!, 'Buy')).not.toHaveLength(0);
    expect(buttons(renderer!, 'More')).not.toHaveLength(0);
    expect(sheet).not.toContain('Order · 40%');
    expect(sheet).not.toContain('Iron sword on the shelf');
    // No Close button: a tap outside, a swipe down and back close it.
    expect(buttons(renderer!, 'Close')).toHaveLength(0);
  });

  it('grows to the full sheet with More, shows the first tab, switches tabs, and shrinks back with Less', () => {
    render();
    act(() => buttons(renderer!, 'More')[0].props.onPress());
    expect(text(renderer!)).toContain('Order · 40%');
    expect(text(renderer!)).toContain('Iron sword on the shelf');
    act(() => tab(renderer!, 'Order · 40%').props.onPress());
    expect(text(renderer!)).toContain('Wants stone and wood');
    expect(text(renderer!)).not.toContain('Iron sword on the shelf');
    act(() => buttons(renderer!, 'Less')[0].props.onPress());
    expect(text(renderer!)).not.toContain('Order · 40%');
  });

  it('has only the peek without tabs: no More', () => {
    render({ tabs: undefined });
    expect(buttons(renderer!, 'More')).toHaveLength(0);
  });

  it('closes on Android back and on a backdrop tap', () => {
    const onClose = jest.fn();
    render({ onClose });
    act(() => renderer!.root.findByType(Modal).props.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
    const backdrop = renderer!.root.findAll((node) => node.props.onPress === onClose)[0];
    expect(backdrop).toBeDefined();
    act(() => backdrop!.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('far, the main action says how far to walk and centres the map instead of acting', () => {
    const onPress = jest.fn();
    const onWalk = jest.fn();
    render({ action: shopAction(320, onPress, onWalk), startFull: true });
    const walk = buttons(renderer!, `Walk 320${NBSP}m to trade`);
    expect(walk).not.toHaveLength(0);
    expect(walk[0].props.disabled).toBeFalsy();
    act(() => walk[0].props.onPress());
    expect(onWalk).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    // Walking goes back to the peek, so the map shows the way.
    expect(text(renderer!)).not.toContain('Order · 40%');
  });

  it('here, the main action acts; blocked, it says why in its own label', () => {
    const onPress = jest.fn();
    render({ action: shopAction(10, onPress) });
    act(() => buttons(renderer!, 'Buy')[0].props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => renderer!.unmount());
    render({ action: shopAction(10, jest.fn(), jest.fn(), 'gold') });
    const blocked = buttons(renderer!, 'Not enough gold');
    expect(blocked).not.toHaveLength(0);
    expect(blocked[0].props.disabled).toBe(true);
  });

  it('grows from the peek to the full sheet when the player walks into range', () => {
    const props: Parameters<typeof MapSheet>[0] = {
      onClose: () => {},
      emoji: '⚒️',
      ring: null,
      title: 'Smithy',
      status: '',
      summary: null,
      action: shopAction(320),
      tabs,
      inRange: false,
    };
    act(() => {
      renderer = create(<MapSheet {...props} />);
    });
    expect(text(renderer!)).not.toContain('Order · 40%');
    act(() => renderer!.update(<MapSheet {...props} action={shopAction(10)} inRange />));
    expect(text(renderer!)).toContain('Order · 40%');
  });

  it('shows the secondary actions in a row under the main one', () => {
    const deliver = jest.fn();
    render({ secondary: [{ key: 'deliver', title: 'Deliver 6 stone', onPress: deliver }] });
    act(() => buttons(renderer!, 'Deliver 6 stone')[0].props.onPress());
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('does not re-render when the save changes: it reads only its props', () => {
    const onRender = jest.fn();
    act(() => {
      renderer = create(
        <Profiler id="sheet" onRender={onRender}>
          <MapSheet
            onClose={() => {}}
            emoji="⚒️"
            ring={{ kind: 'difficulty', difficulty: 'easy' }}
            title="Goblin patrol"
            status="320 m away"
            summary={null}
            action={shopAction(320)}
          />
        </Profiler>,
      );
    });
    const renders = onRender.mock.calls.length;
    act(() => {
      useGameStore.setState({ save: { ...useGameStore.getState().save, gold: useGameStore.getState().save.gold + 999 } });
    });
    expect(onRender.mock.calls.length).toBe(renders);
  });
});

describe('the map sheet status line', () => {
  const now = Date.UTC(2026, 10, 19, 1, 0);
  it('says you are here, or how far, then the time left', () => {
    expect(mapSheetStatus({ distance: 20, range: 50, expiresAt: now + 2.5 * 3_600_000, now })).toBe(`You’re here · leaves in 2${NBSP}h`);
    expect(mapSheetStatus({ distance: 320, range: 50, expiresAt: now + 2.5 * 3_600_000, now })).toBe(
      `320${NBSP}m away · leaves in 2${NBSP}h`,
    );
    expect(mapSheetStatus({ distance: 1460, range: 50, now })).toBe(`1.5${NBSP}km away`);
  });

  it('counts days from two days up, hours from one, minutes below', () => {
    expect(formatTimeLeft(3.2 * 86_400_000)).toBe(`3${NBSP}days`);
    expect(formatTimeLeft(30 * 3_600_000)).toBe(`30${NBSP}h`);
    expect(formatTimeLeft(40 * 60_000 - 5_000)).toBe(`40${NBSP}min`);
    expect(formatTimeLeft(0)).toBe(`1${NBSP}min`);
  });
});
