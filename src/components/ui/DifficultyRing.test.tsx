import { StyleSheet, type ViewStyle } from 'react-native';

import { difficultyRules } from '@/content/difficulty';
import { difficultyTokens } from '@/theme';

import { DifficultyRing } from './DifficultyRing';

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
