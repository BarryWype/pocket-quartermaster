import { StyleSheet, type ViewStyle } from 'react-native';

import { gearRules } from '@/content/gear';

import { ParchmentCard } from './ParchmentCard';

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

/** True when any element's shape draws a legendary gold border. */
function hasLegendaryBorder(node: unknown) {
  return allElements(node).some((element) => {
    const style = StyleSheet.flatten((element.props.style ?? {}) as ViewStyle);
    return style?.borderColor === gearRules.colors.legendary;
  });
}

describe('ParchmentCard titleIconLegendary', () => {
  it('frames the band icon in the legendary gold when set', () => {
    const card = ParchmentCard({ title: 'Relic', titleEmoji: '🗡️', titleIconLegendary: true, children: null });
    expect(hasLegendaryBorder(card)).toBe(true);
  });

  it('keeps the plain brass frame when unset', () => {
    const card = ParchmentCard({ title: 'Sword', titleEmoji: '🗡️', children: null });
    expect(hasLegendaryBorder(card)).toBe(false);
  });
});
