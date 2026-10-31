import { View } from 'react-native';

import { tagInfo } from '@/content/rotation';
import { familyTags } from '@/game/enemies/tags';
import type { MobDef } from '@/game/types';

import { EnemyTags } from './EnemyTags';
import { GameIcon } from './GameIcon';
import { Text } from './Text';

const mob: MobDef = { id: 'wolf', name: 'Wolf', hp: 10, damage: 2, damageType: 'power', speed: 1, tags: ['beast', 'vermin'] };

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

describe('EnemyTags', () => {
  const tree = allElements(EnemyTags({ mob, named: false }));

  it('renders each family as a chip with its own icon, then its label', () => {
    // The emoji never shares the label's Text: the game font holds no emoji
    // glyphs, so a run mixing them measures wrong and clips the label.
    const chips = tree.filter((element) => {
      const kids = element.props.children;
      return element.type === View && Array.isArray(kids) && (kids[0] as Element | undefined)?.type === GameIcon;
    });
    expect(chips).toHaveLength(familyTags(mob).length);
    for (const chip of chips) {
      const [icon, label] = allElements(chip).filter((element) => element.type === GameIcon || element.type === Text);
      expect(icon.type).toBe(GameIcon);
      expect(typeof icon.props.emoji).toBe('string');
      expect(label.props.children).not.toContain(' ');
    }
  });

  it('shows every family label, translated', () => {
    const labels = tree
      .filter((element) => element.type === Text && typeof element.props.children === 'string')
      .map((element) => element.props.children);
    expect(labels).toEqual(familyTags(mob).map((tag) => tagInfo[tag].name));
  });
});
