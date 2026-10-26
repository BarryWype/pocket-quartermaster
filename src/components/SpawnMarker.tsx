import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import type { ResourceKind } from '@/game/generation/types';
import { useAnimationsEnabled } from '@/hooks/useAnimationFrame';

const borderColors: Record<ResourceKind, string> = {
  ore: '#6b6b6b',
  animal: '#8a5a2b',
  herb: '#2f6b2a',
  rare: '#c99a00',
};

type Props = {
  emoji: string;
  kind: ResourceKind;
  inRange: boolean;
  fleeing: boolean;
  /** Needs a better pickaxe than the player has. */
  locked: boolean;
  /** Rocks gently in the wind, e.g. trees. */
  sway?: boolean;
};

export function SpawnMarker({ emoji, kind, inRange, fleeing, locked, sway = false }: Props) {
  const tilt = useSway(sway);
  return (
    <View
      style={[
        styles.tile,
        { borderColor: borderColors[kind] },
        inRange && styles.inRange,
        (fleeing || locked) && styles.faded,
      ]}
    >
      <Animated.Text style={[styles.emoji, styles.swayOrigin, tilt && { transform: [{ rotate: tilt }] }]}>
        {fleeing ? '💨' : emoji}
      </Animated.Text>
    </View>
  );
}

/** A rotation that rocks back and forth while `enabled` and animations are allowed. */
function useSway(enabled: boolean) {
  const animationsEnabled = useAnimationsEnabled();
  const value = useRef(new Animated.Value(0)).current;
  const active = enabled && animationsEnabled;

  useEffect(() => {
    if (!active) return;
    const swing = (toValue: number) =>
      Animated.timing(value, { toValue, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([swing(1), swing(-1)]));
    loop.start();
    return () => {
      loop.stop();
      value.setValue(0);
    };
  }, [active, value]);

  return active ? value.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] }) : null;
}

const styles = StyleSheet.create({
  tile: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4ead2',
    borderWidth: 3,
  },
  inRange: { backgroundColor: '#fff6a8', transform: [{ scale: 1.2 }] },
  faded: { opacity: 0.6 },
  emoji: { fontSize: 16 },
  swayOrigin: { transformOrigin: 'bottom' },
});
