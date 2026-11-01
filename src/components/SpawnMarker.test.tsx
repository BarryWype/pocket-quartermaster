import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { gatheringConfig } from '@/content/gatheringConfig';
import { tutorialRules } from '@/content/tutorial';
import { withinCollectRange } from '@/game/gathering/gathering';
import { colors } from '@/theme';

import { sameSpawnMarker, SpawnMarker } from './SpawnMarker';

jest.mock('@/hooks/useAnimationFrame', () => ({ useAnimationsEnabled: () => false }));

const props = { emoji: '🪨', kind: 'ore' as const, inRange: false, fleeing: false };

describe('withinCollectRange', () => {
  it('reaches exactly as far as the Collect action', () => {
    const radius = gatheringConfig.collectRadiusMeters;
    expect(withinCollectRange(radius - 0.1)).toBe(true);
    expect(withinCollectRange(radius)).toBe(true);
    expect(withinCollectRange(radius + 0.1)).toBe(false);
  });

  it("takes the tutorial's wider range", () => {
    const radius = tutorialRules.collectRadiusMeters;
    expect(radius).toBeGreaterThan(gatheringConfig.collectRadiusMeters);
    expect(withinCollectRange(radius - 0.1, radius)).toBe(true);
    expect(withinCollectRange(radius, radius)).toBe(true);
    expect(withinCollectRange(radius + 0.1, radius)).toBe(false);
  });
});

describe('SpawnMarker', () => {
  it('compares the in-reach state in its memo', () => {
    expect(sameSpawnMarker(props, { ...props })).toBe(true);
    expect(sameSpawnMarker(props, { ...props, inRange: true })).toBe(false);
  });

  it('draws the coloured border only in reach, and re-renders only when that changes', () => {
    let renders = 0;
    function Counting(p: typeof props) {
      renders++;
      return <SpawnMarker {...p} />;
    }
    const Counted = memo(Counting, sameSpawnMarker);
    const borderOf = (tree: ReactTestRenderer) =>
      StyleSheet.flatten(tree.root.findAll((node) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.borderWidth === 3)[0].props.style).borderColor;

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Counted {...props} />);
    });
    expect(borderOf(tree)).not.toBe(colors.success);
    act(() => tree.update(<Counted {...props} />));
    expect(renders).toBe(1);
    act(() => tree.update(<Counted {...props} inRange />));
    expect(renders).toBe(2);
    expect(borderOf(tree)).toBe(colors.success);
    act(() => tree.update(<Counted {...props} />));
    expect(borderOf(tree)).not.toBe(colors.success);
  });
});
