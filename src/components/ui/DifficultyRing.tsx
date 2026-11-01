import type { ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import type { Difficulty } from '@/content/difficulty';
import { difficultyTokens } from '@/theme';

type Props = {
  difficulty: Difficulty;
  /** A diamond ring for the map's rotated markers, a square one for list icons. */
  shape: 'diamond' | 'square';
  /** The wrapped content's width and height, before any rotation. */
  size: number;
  /** Replaces the ring's width, animated or not (the patrol "fresh" pulse). */
  ringWidth?: Animated.WithAnimatedValue<number>;
  /** The marker tile or icon; for a diamond, already rotated 45°. */
  children: ReactNode;
};

/**
 * The difficulty ring around a marker or icon, its colour and width from the
 * tokens; a boss also carries the outer brass ring.
 */
export function DifficultyRing({ difficulty, shape, size, ringWidth, children }: Props) {
  const token = difficultyTokens[difficulty];
  const outer = token.outerRing;
  const innerSide = size + token.width * 2;
  const outerSide = outer ? innerSide + outer.width * 2 : innerSide;
  // A rotated square's on-screen width is its side x 1.41.
  const span = shape === 'diamond' ? Math.round(outerSide * Math.SQRT2) : outerSide;
  const edge = (side: number) => ({ left: (span - side) / 2, top: (span - side) / 2 });
  return (
    <View style={[styles.root, { width: span, height: span }]}>
      {outer && (
        <View
          style={[
            styles.ring,
            shape === 'diamond' && styles.tilt,
            { width: outerSide, height: outerSide, borderWidth: outer.width, borderColor: outer.colour, ...edge(outerSide) },
          ]}
        />
      )}
      <Animated.View
        style={[
          styles.ring,
          shape === 'diamond' && styles.tilt,
          { width: innerSide, height: innerSide, borderWidth: ringWidth ?? token.width, borderColor: token.ring, ...edge(innerSide) },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2 },
  tilt: { transform: [{ rotate: '45deg' }] },
});
