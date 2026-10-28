import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import type { ResourceKind } from '@/game/generation/types';
import { useAnimationsEnabled } from '@/hooks/useAnimationFrame';

import { GameIcon } from './GameIcon';

const borderColors: Record<ResourceKind, string> = {
  wood: '#5e3622',
  ore: '#6b6b6b',
  animal: '#8a5a2b',
  herb: '#2f6b2a',
};

type Props = {
  emoji: string;
  icon?: ImageSourcePropType;
  kind: ResourceKind;
  inRange: boolean;
  fleeing: boolean;
  /** A locked node: visible but greyed out until the player has the pickaxe. */
  locked?: boolean;
  /** Rocks gently in the wind, e.g. trees. */
  sway?: boolean;
};

export function SpawnMarker({ emoji, icon, kind, inRange, fleeing, locked = false, sway = false }: Props) {
  const tilt = useSway(sway);
  return (
    <View
      style={[
        styles.tile,
        { borderColor: borderColors[kind] },
        inRange && styles.inRange,
        fleeing && styles.fleeing,
        locked && styles.locked,
      ]}
    >
      <Animated.View style={[styles.swayOrigin, tilt && { transform: [{ rotate: tilt }] }]}>
        {fleeing ? <GameIcon emoji="💨" size={21} /> : <GameIcon emoji={emoji} icon={icon} size={21} />}
      </Animated.View>
    </View>
  );
}

/** A rotation that rocks back and forth while `enabled` and animations are allowed. */
function useSway(enabled: boolean) {
  const animationsEnabled = useAnimationsEnabled();
  const [value] = useState(() => new Animated.Value(0));
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
  fleeing: { opacity: 0.6 },
  locked: { opacity: 0.45, backgroundColor: '#8f8d88' },
  swayOrigin: { transformOrigin: 'bottom' },
});
