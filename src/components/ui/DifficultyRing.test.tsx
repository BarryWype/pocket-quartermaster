import { StyleSheet, type ViewStyle } from 'react-native';

import { difficultyRules } from '@/content/difficulty';
import { difficultyTokens, ui } from '@/theme';

import { DifficultyRing, TimeRing } from './DifficultyRing';

/** A React element as the tests need it: its type and the props it was created with. */
type Element = { type: unknown; props: Record<string, unknown> };

/** Every element in the tree, depth-first, arrays included. */
function allElements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(allElements);
  if (!node || typeof node !== 'object') return [];
  const element = 'type' in node && 'props' in node ? [node as Element] : [];
  const children = (node as { props?: { children?: unknown } }).props?.children;
  const kids = Array.isArray(children) ? children : [children];
  return [...element, ...kids.flatMap(allElements)];
}

/** True when any of the element's shapes would draw this border. */
function hasBorder(node: unknown, colour: string, width: number) {
  return allElements(node).some((element) => {
    const style = StyleSheet.flatten((element.props.style ?? {}) as ViewStyle);
    return style?.borderColor === colour && style?.borderWidth === width;
  });
}

/** The style of one element, flattened. */
const styleOf = (element: Element) => StyleSheet.flatten((element.props.style ?? {}) as ViewStyle) ?? {};

/** The time-left bars: absolutely positioned fills, unlike the frame they sit on. */
const timeBars = (node: unknown) =>
  allElements(node).filter((element) => {
    const style = styleOf(element);
    return style?.position === 'absolute' && style?.backgroundColor !== undefined && style?.borderColor === undefined;
  });

/** The rotated frame's side, the length each full side's bar runs: the tilted box holding the track. */
const frameSide = (node: unknown) =>
  styleOf(
    allElements(node).find((element) => {
      const style = styleOf(element);
      return style.transform !== undefined && style.borderColor === undefined && typeof style.width === 'number';
    })!,
  ).width as number;

describe('DifficultyRing', () => {
  it.each(difficultyRules.order)('draws the %s ring straight from the tokens', (difficulty) => {
    const token = difficultyTokens[difficulty];
    for (const shape of ['diamond', 'square'] as const) {
      const ring = DifficultyRing({ difficulty, shape, size: 20, children: null });
      expect(hasBorder(ring, token.ring, token.width)).toBe(true);
      if (token.outerRing) {
        expect(hasBorder(ring, token.outerRing.colour, token.outerRing.width)).toBe(true);
      } else {
        expect(allElements(ring)).toHaveLength(2); // only the ring and the content
      }
    }
  });
});

describe('TimeRing', () => {
  const TRACK = 'rgba(30,18,10,0.45)';

  it('draws the faint track over the whole perimeter, and a full brass ring when new', () => {
    const ring = TimeRing({ left: 1, last: false, size: 20, children: null });
    expect(hasBorder(ring, TRACK, 3)).toBe(true);
    const bars = timeBars(ring);
    expect(bars).toHaveLength(4);
    expect(bars.every((bar) => styleOf(bar).backgroundColor === ui.brass)).toBe(true);
  });

  it('drains clockwise from the diamond’s top vertex: at half left, the bottom and left sides remain', () => {
    const ring = TimeRing({ left: 0.5, last: false, size: 20, children: null });
    const bars = timeBars(ring);
    expect(bars).toHaveLength(2);
    const side = frameSide(ring);
    // The elapsed half covers the square's top and right sides, so what remains sits at the bottom and left sides' far ends.
    expect(bars.map((bar) => styleOf(bar))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bottom: 0, left: 0, width: side, height: 3 }),
        expect.objectContaining({ left: 0, top: 0, width: 3, height: side }),
      ]),
    );
  });

  it('turns ember in its last day and carries the hourglass badge at the diamond’s left point', () => {
    const ring = TimeRing({ left: 0.1, last: true, size: 20, children: null });
    expect(timeBars(ring).every((bar) => styleOf(bar).backgroundColor === ui.emberLight)).toBe(true);
    const badge = allElements(ring).find((element) => element.props.children === '⏳');
    expect(badge).toBeDefined();
    expect(styleOf(allElements(ring).find((element) => styleOf(element)?.backgroundColor === ui.ember)!)).toMatchObject({
      left: expect.any(Number),
      top: '50%',
    });
  });
});
