import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { IconLabel } from './IconLabel';
import { Text } from './Text';
import { AffixLines } from './AffixLines';

import type { GearInstance } from '@/game/types';

const piece = (over: Partial<GearInstance>): GearInstance =>
  ({ uid: 'g1', itemId: 'stoneSword', rarity: 'rare', roll: 12, affixes: [], rerolls: 0, ...over }) as GearInstance;

const textsOf = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === 'string');

describe('AffixLines', () => {
  it('renders each affix as its own line', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <AffixLines
          piece={piece({ affixes: [
            { id: 'hunter', value: 22 },
            { id: 'infusedFire', value: 0 },
          ] })}
        />,
      );
    });
    expect(textsOf(tree)).toEqual(
      expect.arrayContaining(['Hunter: +22% damage to beasts', 'Fire-infused: Hits carry Fire']),
    );
    expect(tree.root.findAllByType(IconLabel)).toHaveLength(2);
  });

  it('renders a relic piece under its relic name, a Legendary unique under "Unique:"', () => {
    let relic!: ReactTestRenderer;
    act(() => {
      relic = create(<AffixLines piece={piece({ relicId: 'poachersLongbow' })} />);
    });
    expect(textsOf(relic)).toContain('Poacher’s longbow');
    expect(relic.root.findAllByType(IconLabel)).toHaveLength(1);

    let unique!: ReactTestRenderer;
    act(() => {
      unique = create(<AffixLines piece={piece({ rarity: 'legendary', unique: 'poachersLongbow' })} />);
    });
    expect(textsOf(unique)).toContain('Unique: Double crit damage against beasts; a Wild tag for its carrier');
    expect(unique.root.findAllByType(IconLabel)).toHaveLength(1);
  });

  it('renders nothing for a plain piece', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<AffixLines piece={piece({})} />);
    });
    expect(textsOf(tree)).toEqual([]);
  });
});
