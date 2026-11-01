import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import type { ResourceKind } from '@/game/generation/types';
import { useAnimationsEnabled } from '@/hooks/useAnimationFrame';
import { colors, ui } from '@/theme';

import { GameIcon } from './GameIcon';

/** The diamond's fill, a light tint of each resource kind. */
const fills: Record<ResourceKind, string> = {
  wood: '#E8D3B8',
  ore: '#DADAD6',
  animal: '#EBD7BC',
  herb: '#D7E6C8',
};

/** The rotated square's side: its diagonal keeps the old 30 px tile's footprint. */
const SIDE = 21;
/** The wrapper keeps the tap target at 44 pt around the smaller diamond. */
const TAP = 44;

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

/** The memo comparison for map markers: every prop, so walking in or out of reach re-renders only that marker. */
export const sameSpawnMarker = (a: Props, b: Props) =>
  (Object.keys({ ...a, ...b }) as (keyof Props)[]).every((key) => a[key] === b[key]);

export function SpawnMarker({ emoji, icon, kind, inRange, fleeing, locked = false, sway = false }: Props) {
  const tilt = useSway(sway);
  return (
    <View style={styles.tap}>
      <View
        style={[
          styles.tile,
          { backgroundColor: fills[kind] },
          inRange && styles.inRange,
          fleeing && styles.fleeing,
          locked && styles.locked,
        ]}
      >
        <View style={styles.upright}>
          <Animated.View style={[styles.swayOrigin, tilt && { transform: [{ rotate: tilt }] }]}>
            {fleeing ? <GameIcon emoji="💨" size={18} /> : <GameIcon emoji={emoji} icon={icon} size={18} />}
          </Animated.View>
        </View>
      </View>
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
  tap: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  tile: {
    width: SIDE,
    height: SIDE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: ui.outline,
    transform: [{ rotate: '45deg' }],
  },
  inRange: { backgroundColor: colors.highlight, borderColor: colors.success, transform: [{ rotate: '45deg' }, { scale: 1.2 }] },
  fleeing: { opacity: 0.6 },
  locked: { opacity: 0.45, backgroundColor: '#8f8d88' },
  swayOrigin: { transformOrigin: 'bottom' },
  upright: { transform: [{ rotate: '-45deg' }] },
});
