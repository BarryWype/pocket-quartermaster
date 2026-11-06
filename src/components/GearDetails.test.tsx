import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AffixLines } from './AffixLines';
import { GearDetails } from './GearDetails';
import { IconLabel } from './IconLabel';

import type { GearInstance } from '@/game/types';

const piece = (over: Partial<GearInstance>): GearInstance =>
  ({ uid: 'g1', itemId: 'sword1', rarity: 'rare', roll: 12, affixes: [], rerolls: 0, ...over }) as GearInstance;

const labelsOf = (tree: ReactTestRenderer) => tree.root.findAllByType(IconLabel).map((node) => String(node.props.label));

const render = (gear: GearInstance) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<GearDetails gear={gear} compact />);
  });
  return tree;
};

describe('GearDetails', () => {
  it('shows a weapon’s own stats and each of its affixes', () => {
    const tree = render(piece({ affixes: [{ id: 'hunter', value: 22 }] }));
    const labels = labelsOf(tree);
    // The rolled power, as a stat part.
    expect(labels.some((label) => /^\d+$/.test(label.trim()))).toBe(true);
    expect(labels).toContain('Hunter: +22% damage to beasts');
    expect(tree.root.findAllByType(AffixLines)).toHaveLength(1);
  });

  it('shows a work tool’s job line', () => {
    const tree = render(piece({ itemId: 'hatchet1', rarity: 'common' }));
    const texts = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children as string);
    expect([...labelsOf(tree), ...texts].join(' ').toLowerCase()).toMatch(/wood/);
  });
});
