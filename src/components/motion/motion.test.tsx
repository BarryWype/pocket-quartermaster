import { StyleSheet, Text } from 'react-native';
import { act } from 'react-test-renderer';

import { MOTION_LEVELS, motion } from '@/content/motion';
import { formatNumber, setLocale } from '@/i18n';
import * as feelModule from '@/services/feel';
import { ui } from '@/theme';

import { Appear } from './Appear';
import { CountUp, groupDigits } from './CountUp';
import { useFreshRows } from '@/hooks/useFreshRows';

import { AnchoredPopup } from '../ui/AnchoredPopup';
import { DiamondRail } from '../ui/DiamondRail';
import { FillBar } from './FillBar';
import { OverlayPanel } from './OverlayPanel';
import { Flash, MarkerPulse, Pulse } from './Pulse';
import { Toast } from './Toast';
import { advance, animatedProps, animatedStyles, cleanup, expectNothingLeftRunning, mount, setMotionLevel } from './motionHarness';
import { PressScale } from './PressScale';

/** How full each block of a FillBar is now, 0–1: a plain block from its style, a moving one from its animation. */
function blockCovers(renderer: ReturnType<typeof mount>): number[] {
  const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined;
  const blocks = renderer.root.findAll((node) => typeof node.type === 'string' && flat(node)?.flex === 1 && flat(node)?.backgroundColor === ui.woodDark);
  return blocks.map((block) => {
    const fill = block.findAll((node) => typeof node.type === 'string' && flat(node)?.transformOrigin === 'left')[0];
    if (!fill) return 0;
    const animated = fill.props.jestAnimatedStyle?.value as { transform?: { scaleX: number }[]; opacity?: number } | undefined;
    if (animated) return animated.transform ? animated.transform[0].scaleX : (animated.opacity ?? 1);
    const transform = flat(fill)?.transform as { scaleX: number }[] | undefined;
    return transform ? transform[0].scaleX : 1;
  });
}

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

/** The pressable PressScale draws, with its own press handlers. */
const pressable = (renderer: ReturnType<typeof mount>) =>
  renderer.root.find((node) => node.props.accessibilityLabel === 'button' && typeof node.props.onPressIn === 'function');

/** The style the button's view gets: its own plus the press transition. */
const pressStyle = (renderer: ReturnType<typeof mount>) =>
  StyleSheet.flatten(pressable(renderer).props.style) as { transform?: { scale: number }[]; transitionProperty?: string; transitionDuration?: number };

const press = (renderer: ReturnType<typeof mount>, phase: 'onPressIn' | 'onPressOut') =>
  act(() => pressable(renderer).props[phase]({ nativeEvent: {} }));

afterEach(() => {
  mockFocused = true;
  cleanup();
  setMotionLevel('full');
  setLocale('en');
  jest.useRealTimers();
});

describe('PressScale', () => {
  const button = (disabled = false) => (
    <PressScale accessibilityLabel="button" disabled={disabled} onPress={() => {}}>
      <Text>Go</Text>
    </PressScale>
  );

  test('Full: shrinks on press-in and eases back on release, as native transitions', () => {
    setMotionLevel('full');
    const renderer = mount(button());
    expect(pressStyle(renderer)).toMatchObject({ transform: [{ scale: 1 }], transitionProperty: 'transform' });
    press(renderer, 'onPressIn');
    expect(pressStyle(renderer)).toMatchObject({ transform: [{ scale: motion.pressScale }], transitionDuration: motion.duration.press });
    press(renderer, 'onPressOut');
    expect(pressStyle(renderer)).toMatchObject({ transform: [{ scale: 1 }], transitionDuration: motion.duration.small });
  });

  test('Reduced: stays still, the control keeps only its own pressed look', () => {
    setMotionLevel('reduced');
    const renderer = mount(button());
    press(renderer, 'onPressIn');
    expect(pressStyle(renderer).transform).toBeUndefined();
  });

  test('Off: stays still', () => {
    setMotionLevel('off');
    const renderer = mount(button());
    press(renderer, 'onPressIn');
    expect(pressStyle(renderer).transform).toBeUndefined();
  });

  test('a disabled button stays still', () => {
    const renderer = mount(button(true));
    expect(pressable(renderer).props.disabled).toBe(true);
    expect(pressStyle(renderer)).toMatchObject({ transform: [{ scale: 1 }] });
  });

  test('a press plays the press haptic, unless the control plays its own', () => {
    const played = jest.spyOn(feelModule, 'feel').mockImplementation(() => {});
    const renderer = mount(button());
    act(() => pressable(renderer).props.onPress({ nativeEvent: {} }));
    const silent = mount(
      <PressScale accessibilityLabel="quiet" haptic={false} onPress={() => {}}>
        <Text>Go</Text>
      </PressScale>,
    );
    act(() => silent.root.find((node) => node.props.accessibilityLabel === 'quiet' && typeof node.props.onPressIn === 'function').props.onPress({ nativeEvent: {} }));
    expect(played.mock.calls).toEqual([['press']]);
    played.mockRestore();
  });
});

describe('Appear', () => {
  test('Full: fades in and rises into place', () => {
    setMotionLevel('full');
    const renderer = mount(<Appear><Text>Row</Text></Appear>);
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 0, transform: [{ translateY: motion.appearRise }] });
    advance(motion.duration.medium + 20);
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 1, transform: [{ translateY: 0 }] });
  });

  test('waits for its delay', () => {
    const renderer = mount(<Appear delay={100}><Text>Row</Text></Appear>);
    advance(80);
    expect(animatedStyles(renderer)[0]).toMatchObject({ opacity: 0 });
  });

  test('Reduced: fades only', () => {
    setMotionLevel('reduced');
    const renderer = mount(<Appear><Text>Row</Text></Appear>);
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 0 });
    advance(motion.duration.medium + 20);
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 1 });
  });

  test('Off: shown at once', () => {
    setMotionLevel('off');
    const renderer = mount(<Appear><Text>Row</Text></Appear>);
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 1 });
  });
});

describe('CountUp', () => {
  const ticker = (renderer: ReturnType<typeof mount>) => animatedProps(renderer)[0]?.text;
  const [finalNumber, tickerLayer] = [0, 1];

  test('groups digits exactly like formatNumber, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      setLocale(locale);
      for (const value of [0, 7, 999, 1000, 12345, 999999, 1234567, -4321]) {
        expect(groupDigits(value, locale === 'fr' ? ' ' : ',')).toBe(formatNumber(value));
      }
    }
  });

  test('the first value shows as is, in plain text', () => {
    const renderer = mount(<CountUp value={1200} />);
    expect(renderer.root.findByType(Text).props.children).toBe('1,200');
    // Nothing animated is even mounted until the number first changes.
    expect(animatedStyles(renderer)).toEqual([]);
  });

  test('Full: ticks from the old value to the new one over the plain text, then hands back', () => {
    setMotionLevel('full');
    const renderer = mount(<CountUp value={100} />);
    act(() => renderer.update(<CountUp value={1100} />));
    // The plain text already holds the new value, so the layout is final from the start (the other text is the "+1,000").
    expect(renderer.root.findAllByType(Text)[0].props.children).toBe('1,100');
    advance(motion.duration.medium / 2);
    const midway = Number(String(ticker(renderer)).replace(/,/g, ''));
    expect(midway).toBeGreaterThan(100);
    expect(midway).toBeLessThan(1100);
    expect(animatedStyles(renderer)[finalNumber]).toEqual({ opacity: 0 });
    advance(motion.duration.medium);
    expect(ticker(renderer)).toBe('1,100');
    expect(animatedStyles(renderer)[finalNumber]).toEqual({ opacity: 1 });
    expect(animatedStyles(renderer)[tickerLayer]).toEqual({ opacity: 0 });
  });

  test('Reduced: no ticking, the new value fades in', () => {
    setMotionLevel('reduced');
    const renderer = mount(<CountUp value={100} />);
    act(() => renderer.update(<CountUp value={150} />));
    advance(16);
    expect(renderer.root.findAll((node) => node.props.animatedProps !== undefined)).toHaveLength(0);
    expect((animatedStyles(renderer)[finalNumber].opacity as number) < 1).toBe(true);
    advance(motion.duration.small + 20);
    expect(animatedStyles(renderer)[finalNumber]).toEqual({ opacity: 1 });
  });

  test('Off: changes at once', () => {
    setMotionLevel('off');
    const renderer = mount(<CountUp value={100} />);
    act(() => renderer.update(<CountUp value={150} />));
    advance(16);
    expect(renderer.root.findByType(Text).props.children).toBe('150');
    expect(animatedStyles(renderer)).toEqual([]);
  });
});

describe('changes seen live', () => {
  const gains = (renderer: ReturnType<typeof mount>) =>
    renderer.root.findAllByType(Text).filter((node) => String(node.props.children).startsWith('+')).map((node) => node.props.children);

  test('a gain floats a "+N" once, a loss does not', () => {
    const renderer = mount(<CountUp value={100} />);
    act(() => renderer.update(<CountUp value={130} />));
    expect(gains(renderer)).toEqual(['+30']);
    act(() => renderer.update(<CountUp value={120} />));
    expect(gains(renderer)).toEqual([]);
  });

  test('a count that grows all the time can leave the "+N" out', () => {
    const renderer = mount(<CountUp value={100} gain={false} />);
    act(() => renderer.update(<CountUp value={130} gain={false} />));
    expect(gains(renderer)).toEqual([]);
  });

  test('a change while the screen is covered shows as is when it comes back', () => {
    mockFocused = false;
    const renderer = mount(<CountUp value={100} />);
    act(() => renderer.update(<CountUp value={400} />));
    // The map thaws with the new value in the same render that shows it again.
    mockFocused = true;
    act(() => renderer.update(<CountUp value={900} />));
    advance(16);
    expect(animatedStyles(renderer)[tickerLayerIndex]).toEqual({ opacity: 0 });
    expect(gains(renderer)).toEqual([]);
    // The next change, seen live, ticks.
    act(() => renderer.update(<CountUp value={950} />));
    advance(16);
    expect(animatedStyles(renderer)[tickerLayerIndex]).toEqual({ opacity: 1 });
  });

  test('a bar that changed while covered shows its new fill at once', () => {
    mockFocused = false;
    const renderer = mount(<FillBar value={0} segments={2} />);
    mockFocused = true;
    act(() => renderer.update(<FillBar value={1} segments={2} />));
    expect(animatedStyles(renderer)).toEqual([]);
    expect(blockCovers(renderer)).toEqual([1, 1]);
  });

  test('a one-segment bar fills to the exact share', () => {
    const renderer = mount(<FillBar value={0.37} segments={1} />);
    expect(blockCovers(renderer)).toEqual([0.37]);
  });
});

const tickerLayerIndex = 1;

describe('FillBar', () => {
  test('the first value shows as is, with nothing animated mounted', () => {
    const renderer = mount(<FillBar value={0.3} segments={4} />);
    expect(blockCovers(renderer)).toEqual([1, 0, 0, 0]);
    expect(animatedStyles(renderer)).toEqual([]);
  });

  test('Full: blocks fill from the left in turn, and empty from the right when it goes down', () => {
    setMotionLevel('full');
    const renderer = mount(<FillBar value={0} segments={4} />);
    act(() => renderer.update(<FillBar value={1} segments={4} />));
    advance(motion.duration.medium / 2);
    const midway = blockCovers(renderer);
    expect(midway[0]).toBe(1);
    expect(midway[3]).toBeLessThan(1);
    expect([...midway].sort((a, b) => b - a)).toEqual(midway);
    advance(motion.duration.medium);
    expect(blockCovers(renderer)).toEqual([1, 1, 1, 1]);
    act(() => renderer.update(<FillBar value={0.5} segments={4} />));
    advance(motion.duration.medium / 4);
    const emptying = blockCovers(renderer);
    expect(emptying[3]).toBeLessThan(1);
    expect(emptying[2]).toBe(1);
    advance(motion.duration.medium);
    expect(blockCovers(renderer)).toEqual([1, 1, 0, 0]);
  });

  test('only the blocks that change are animated', () => {
    const renderer = mount(<FillBar value={0.2} segments={10} />);
    act(() => renderer.update(<FillBar value={0.5} segments={10} />));
    expect(animatedStyles(renderer)).toHaveLength(3);
  });

  test('Reduced: blocks fade instead of growing', () => {
    setMotionLevel('reduced');
    const renderer = mount(<FillBar value={0} segments={2} />);
    act(() => renderer.update(<FillBar value={1} segments={2} />));
    advance(motion.duration.medium + 20);
    expect(animatedStyles(renderer)).toEqual([{ opacity: 1 }, { opacity: 1 }]);
  });

  test('Off: the fill jumps', () => {
    setMotionLevel('off');
    const renderer = mount(<FillBar value={0} segments={2} />);
    act(() => renderer.update(<FillBar value={1} segments={2} />));
    expect(animatedStyles(renderer)).toEqual([]);
    expect(blockCovers(renderer)).toEqual([1, 1]);
  });
});

describe('OverlayPanel', () => {
  const panel = (position: 'center' | 'bottom') => (
    <OverlayPanel position={position} animated style={{ flex: 1 }}>
      <Text>Panel</Text>
    </OverlayPanel>
  );
  const layOut = (renderer: ReturnType<typeof mount>, height: number) =>
    act(() => renderer.root.find((node) => typeof node.props.onLayout === 'function').props.onLayout({ nativeEvent: { layout: { height } } }));

  test('Full: a dialog fades in from a little smaller', () => {
    const renderer = mount(panel('center'));
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 0, transform: [{ scale: motion.dialogScale }] });
    advance(motion.duration.medium + 20);
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
  });

  test('Full: a sheet starts below the screen and slides up by its own height once laid out', () => {
    const renderer = mount(panel('bottom'));
    const start = (animatedStyles(renderer)[0].transform as { translateY: number }[])[0].translateY;
    expect(start).toBeGreaterThan(300);
    layOut(renderer, 300);
    advance(16);
    expect((animatedStyles(renderer)[0].transform as { translateY: number }[])[0].translateY).toBeLessThanOrEqual(300);
    advance(1000);
    expect(animatedStyles(renderer)[0]).toEqual({ transform: [{ translateY: 0 }] });
  });

  test.each(['reduced', 'off'] as const)('%s: the panel stands still, only the modal fades', (level) => {
    setMotionLevel(level);
    expect(animatedStyles(mount(panel('center')))[0]).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
    const sheet = mount(panel('bottom'));
    layOut(sheet, 300);
    advance(16);
    expect(animatedStyles(sheet)[0]).toEqual({ transform: [{ translateY: 0 }] });
  });

  test('a panel that animates itself is left alone', () => {
    const renderer = mount(
      <OverlayPanel position="center" animated={false} style={{ flex: 1 }}>
        <Text>Popup</Text>
      </OverlayPanel>,
    );
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
  });
});

describe('Toast', () => {
  const toast = () => mount(<Toast edge="top"><Text>New recipe</Text></Toast>);
  const animationsOf = (renderer: ReturnType<typeof mount>) => {
    const { entering, exiting } = renderer.root.find((node) => 'entering' in node.props).props;
    return { entering: entering !== undefined, exiting: exiting !== undefined };
  };

  test('Full and Reduced: it comes in and fades out', () => {
    expect(animationsOf(toast())).toEqual({ entering: true, exiting: true });
    setMotionLevel('reduced');
    expect(animationsOf(toast())).toEqual({ entering: true, exiting: true });
  });

  test('Off: it just shows', () => {
    setMotionLevel('off');
    expect(animationsOf(toast())).toEqual({ entering: false, exiting: false });
  });
});

describe('AnchoredPopup', () => {
  const anchor = { x: 40, y: 100, width: 50, height: 50 };
  const popup = () => mount(<AnchoredPopup anchor={anchor} onClose={() => {}} render={() => <Text>Card</Text>} />);
  const measure = (renderer: ReturnType<typeof mount>) =>
    act(() => renderer.root.find((node) => typeof node.props.onLayout === 'function').props.onLayout({ nativeEvent: { layout: { height: 120 } } }));

  test('Full: waits to be placed, then grows out of the slot it points at', () => {
    const renderer = popup();
    advance(400);
    expect(animatedStyles(renderer).at(-1)).toMatchObject({ opacity: 0 });
    measure(renderer);
    advance(motion.duration.medium + 20);
    expect(animatedStyles(renderer).at(-1)).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
    // It grows from the pointer, on the edge facing the slot.
    const grower = renderer.root.find((node) => node.props.jestAnimatedStyle?.value === animatedStyles(renderer).at(-1));
    expect(JSON.stringify(grower.props.style)).toContain('"transformOrigin"');
  });

  test('Reduced: shown as soon as it is placed', () => {
    setMotionLevel('reduced');
    expect(animatedStyles(popup()).at(-1)).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
  });
});

describe('Pulse', () => {
  const slot = (on: string | null) => (
    <Pulse on={on}>
      <Text>Slot</Text>
    </Pulse>
  );
  const scale = (renderer: ReturnType<typeof mount>) => (animatedStyles(renderer)[0].transform as { scale: number }[])[0].scale;

  test('Full: a piece landing pulses the slot up and back, once', () => {
    const renderer = mount(slot(null));
    act(() => renderer.update(slot('sword')));
    advance(motion.duration.press);
    expect(scale(renderer)).toBeCloseTo(motion.pulseScale, 2);
    advance(1000);
    expect(scale(renderer)).toBeCloseTo(1, 3);
  });

  test('taking the piece off does not pulse', () => {
    const renderer = mount(slot('sword'));
    act(() => renderer.update(slot(null)));
    advance(motion.duration.press);
    expect(animatedStyles(renderer)).toEqual([]);
  });

  test('Reduced: a dip in opacity instead; Off: nothing', () => {
    setMotionLevel('reduced');
    const reduced = mount(slot(null));
    act(() => reduced.update(slot('sword')));
    advance(motion.duration.press);
    expect(animatedStyles(reduced)[0].opacity as number).toBeLessThan(1);
    setMotionLevel('off');
    const off = mount(slot(null));
    act(() => off.update(slot('sword')));
    advance(motion.duration.press);
    expect(animatedStyles(off)).toEqual([]);
  });

  test('a map node coming into reach pulses even though markers ignore focus', () => {
    mockFocused = false;
    const renderer = mount(
      <MarkerPulse on={null}>
        <Text>Node</Text>
      </MarkerPulse>,
    );
    act(() =>
      renderer.update(
        <MarkerPulse on="inRange">
          <Text>Node</Text>
        </MarkerPulse>,
      ),
    );
    advance(motion.duration.press);
    expect(scale(renderer)).toBeGreaterThan(1);
  });
});

describe('Flash', () => {
  test('lights the border once per thing made, then fades', () => {
    const renderer = mount(<Flash count={0} />);
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 0 });
    act(() => renderer.update(<Flash count={1} />));
    advance(16);
    expect(animatedStyles(renderer)[0].opacity as number).toBeGreaterThan(0.5);
    advance(motion.duration.large + 20);
    expect(animatedStyles(renderer)[0]).toEqual({ opacity: 0 });
  });
});

describe('useFreshRows', () => {
  function List({ ids, unseen }: { ids: string[]; unseen: string[] }) {
    const fresh = useFreshRows(ids, (id) => unseen.includes(id));
    return <Text>{[...fresh].join(',')}</Text>;
  }
  const shown = (renderer: ReturnType<typeof mount>) => renderer.root.findByType(Text).props.children;

  test('new rows at opening and new arrivals stay fresh, even once marked seen', () => {
    const renderer = mount(<List ids={['a', 'b']} unseen={['b']} />);
    expect(shown(renderer)).toBe('b');
    // The list marks everything seen a moment later: b stays fresh for this opening.
    act(() => renderer.update(<List ids={['a', 'b']} unseen={[]} />));
    expect(shown(renderer)).toBe('b');
    // A new quest arrives while the list is open.
    act(() => renderer.update(<List ids={['a', 'b', 'c']} unseen={['c']} />));
    expect(shown(renderer)).toBe('b,c');
  });
});

describe('DiamondRail', () => {
  const rail = (selected: string) => (
    <DiamondRail
      items={[
        { key: 'a', label: 'A', emoji: '🗡️' },
        { key: 'b', label: 'B', emoji: '🛡️' },
      ]}
      selected={selected}
      onSelect={() => {}}
    />
  );
  const lay = (renderer: ReturnType<typeof mount>) =>
    renderer.root
      .findAll((node) => typeof node.type === 'string' && typeof node.props.onLayout === 'function')
      .forEach((node, i) => act(() => node.props.onLayout({ nativeEvent: { layout: { x: 0, y: 18 + i * 80, width: 74, height: 70 } } })));
  const marker = (renderer: ReturnType<typeof mount>) => {
    // The animated component's own style (its host view only gets what the transition leaves).
    const node = renderer.root.findAll((one) => StyleSheet.flatten(one.props.style)?.backgroundColor === ui.brass && StyleSheet.flatten(one.props.style)?.width === 4)[0];
    return StyleSheet.flatten(node.props.style) as { transform: { translateY: number }[]; transitionProperty?: string };
  };

  test('the marker takes its place beside the pick, and moves to the next one as a native transition', () => {
    const renderer = mount(rail('a'));
    lay(renderer);
    expect(marker(renderer).transform).toEqual([{ translateY: 18 }]);
    expect(marker(renderer).transitionProperty).toBe('transform');
    act(() => renderer.update(rail('b')));
    expect(marker(renderer).transform).toEqual([{ translateY: 98 }]);
  });

  test('below Full it jumps', () => {
    setMotionLevel('reduced');
    const renderer = mount(rail('a'));
    lay(renderer);
    expect(marker(renderer).transitionProperty).toBeUndefined();
  });
});

describe.each(MOTION_LEVELS)('nothing keeps running after unmount (%s)', (level) => {
  beforeEach(() => setMotionLevel(level));

  test('PressScale', () =>
    expectNothingLeftRunning(
      <PressScale accessibilityLabel="button" onPress={() => {}}>
        <Text>Go</Text>
      </PressScale>,
      (renderer) => pressable(renderer).props.onPressIn({ nativeEvent: {} }),
    ));

  test('Appear', () => expectNothingLeftRunning(<Appear delay={30}><Text>Row</Text></Appear>));

  test('CountUp', () => expectNothingLeftRunning(<CountUp value={10} />, (renderer) => renderer.update(<CountUp value={500} />)));

  test('FillBar', () => expectNothingLeftRunning(<FillBar value={0} />, (renderer) => renderer.update(<FillBar value={0.8} />)));

  test.each(['center', 'bottom'] as const)('OverlayPanel (%s)', (position) =>
    expectNothingLeftRunning(
      <OverlayPanel position={position} animated style={{ flex: 1 }}>
        <Text>Panel</Text>
      </OverlayPanel>,
      (renderer) => renderer.root.findAll((node) => typeof node.props.onLayout === 'function')[0]?.props.onLayout({ nativeEvent: { layout: { height: 300 } } }),
    ));

  test('Toast', () => expectNothingLeftRunning(<Toast edge="bottom"><Text>+1 wood</Text></Toast>));

  test('Pulse', () =>
    expectNothingLeftRunning(
      <Pulse on={null}>
        <Text>Slot</Text>
      </Pulse>,
      (renderer) =>
        renderer.update(
          <Pulse on="sword">
            <Text>Slot</Text>
          </Pulse>,
        ),
    ));

  test('Flash', () => expectNothingLeftRunning(<Flash count={0} />, (renderer) => renderer.update(<Flash count={1} />)));

  test('AnchoredPopup', () =>
    expectNothingLeftRunning(<AnchoredPopup anchor={null} onClose={() => {}} render={() => <Text>Card</Text>} />));
});
