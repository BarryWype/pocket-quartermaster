import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { motion, type MotionLevel } from '@/content/motion';
import { useAppActive, useLiveChange, useTrackedChange, type LiveChange } from '@/hooks/useLiveChange';
import { spring, timing, useMotion } from '@/hooks/useMotion';

type Props = {
  /** What the wrapped piece holds or is: it pulses when this changes on screen to something (not to null). */
  on: string | null;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * One pulse when something lands: up to `pulseScale` and back with the pop
 * spring (Full), a quick dip and fade back (Reduced), nothing (Off). Only a
 * change seen live pulses (`useLiveChange`). For a slot a piece is equipped
 * into, a map node coming into reach.
 */
export function Pulse({ on, style, children }: Props) {
  return (
    <PulseBody change={useLiveChange(on)} style={style}>
      {children}
    </PulseBody>
  );
}

/**
 * `Pulse` for a map marker: it counts as seen while the app is in front. The
 * map freezes while another screen covers it, and following focus would
 * re-render every marker on each screen change.
 */
export function MarkerPulse({ on, style, children }: Props) {
  return (
    <PulseBody change={useTrackedChange(on, useAppActive())} style={style}>
      {children}
    </PulseBody>
  );
}

/** Plain until something lands while seen: only then is an animated view mounted, so a screen of slots or markers costs plain views. */
function PulseBody({ change, style, children }: { change: LiveChange<string | null>; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const { level } = useMotion();
  if (!change.live || change.value === null || level === 'off') return <View style={style}>{children}</View>;
  return (
    <Pulsing key={change.changes} level={level} style={style}>
      {children}
    </Pulsing>
  );
}

function Pulsing({ level, style, children }: { level: MotionLevel; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const beat = useSharedValue(0);
  useEffect(() => {
    beat.set(withSequence(withTiming(1, timing('press')), level === 'full' ? withSpring(0, spring('pop')) : withTiming(0, timing('small'))));
    // It pulses once, when the landing mounts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulsing = useAnimatedStyle(() =>
    level === 'full' ? { transform: [{ scale: 1 + (motion.pulseScale - 1) * beat.value }] } : { opacity: 1 - 0.4 * beat.value },
  );
  return <Animated.View style={[style, pulsing]}>{children}</Animated.View>;
}

/** A border that lights up over a card and fades, once per change of `count` seen live (a craft made from the card). */
export function Flash({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  const { level } = useMotion();
  const change = useLiveChange(count);
  const light = useSharedValue(0);
  useEffect(() => {
    if (!change.live || level === 'off') return;
    light.set(withSequence(withTiming(1, { duration: 0 }), withTiming(0, timing('large'))));
  }, [change, level, light]);
  const lit = useAnimatedStyle(() => ({ opacity: light.value }));
  return <Animated.View pointerEvents="none" style={[style, lit]} />;
}
