import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { classSpecials } from '@/content/classSpecials';
import { specials } from '@/content/specials';

import { SpecialLabel } from './SpecialLabel';
import { Text } from './Text';

const textsOf = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === 'string');

describe('SpecialLabel', () => {
  it('names the special, with the rare mark only on the class rare', () => {
    let common!: ReactTestRenderer;
    act(() => {
      common = create(<SpecialLabel classId="warrior" special="cleave" />);
    });
    expect(textsOf(common)).toContain('Cleave');
    expect(textsOf(common)).not.toContain('✦');

    const rareId = classSpecials.warrior.rare;
    let rare!: ReactTestRenderer;
    act(() => {
      rare = create(<SpecialLabel classId="warrior" special={rareId} short />);
    });
    expect(textsOf(rare)).toContain(specials[rareId].name);
    expect(textsOf(rare)).toContain('✦');
  });
});
