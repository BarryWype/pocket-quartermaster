import { setLocale, type Locale } from '@/i18n';

import { GameIcon } from './GameIcon';
import { Price } from './Price';
import { Text } from './Text';

/** A React element as the tests need it: its type and the props it was created with. */
type Element = { type: unknown; props: Record<string, unknown> };

function allElements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(allElements);
  if (!node || typeof node !== 'object') return [];
  const element = 'type' in node && 'props' in node ? [node as Element] : [];
  const children = (node as { props?: { children?: unknown } }).props?.children;
  const kids = Array.isArray(children) ? children : [children];
  return [...element, ...kids.flatMap(allElements)];
}

const NBSP = ' ';
const cases: Record<Locale, [number, string][]> = {
  en: [[0, '0'], [5, '5'], [1250, '1,250'], [99999, '99,999']],
  fr: [[0, '0'], [5, '5'], [1250, `1${NBSP}250`], [99999, `99${NBSP}999`]],
};

describe('Price', () => {
  afterAll(() => setLocale('en'));

  for (const locale of ['en', 'fr'] as Locale[]) {
    for (const [amount, shown] of cases[locale]) {
      it(`shows ${amount} in ${locale} as "${shown}", in its own Text beside the coin`, () => {
        setLocale(locale);
        const tree = allElements(Price({ amount }));
        const icon = tree.find((element) => element.type === GameIcon);
        const texts = tree.filter((element) => element.type === Text);
        expect(icon?.props.emoji).toBe('🪙');
        expect(texts).toHaveLength(1);
        expect(texts[0].props.children).toBe(shown);
      });
    }
  }

  it('reads a range, a gain and a short amount', () => {
    setLocale('en');
    const textOf = (element: ReturnType<typeof Price>) => allElements(element).find((e) => e.type === Text)!;
    expect(textOf(Price({ amount: 10, to: 20 })).props.children).toBe('10–20');
    expect(textOf(Price({ amount: 12, prefix: '+' })).props.children).toBe('+12');
    expect(JSON.stringify(textOf(Price({ amount: 12, short: true })).props.style)).toContain('"color"');
    expect(JSON.stringify(textOf(Price({ amount: 12 })).props.style)).not.toContain('"color"');
  });

  it('never shrinks, so a crowded row cannot clip the amount', () => {
    const [row] = allElements(Price({ amount: 25 }));
    expect(JSON.stringify(row.props.style)).toContain('"flexShrink":0');
  });
});
