import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { motion } from '@/content/motion';
import { timing, useMotion } from '@/hooks/useMotion';

type Props = {
  children: ReactNode;
  /** Milliseconds before it starts, to stagger a few pieces. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Fades in and rises a few pixels when it mounts, once (Full); fades only
 * (Reduced); shows at once (Off). Its content renders on the first frame and
 * takes its place in the layout from the start, so nothing around it moves.
 */
export function Appear({ children, delay = 0, style }: Props) {
  const { level } = useMotion();
  const shown = useSharedValue(level === 'off' ? 1 : 0);
  const animated = useAnimatedStyle(() =>
    level === 'full'
      ? { opacity: shown.value, transform: [{ translateY: (1 - shown.value) * motion.appearRise }] }
      : { opacity: shown.value },
  );

  useEffect(() => {
    if (level === 'off') return;
    shown.set(withDelay(delay, withTiming(1, timing('medium'))));
    // It appears once, when it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** A list row that appears once when it is new (`useFreshRows`), and is drawn plainly otherwise, at no cost. */
export function AppearIf({ fresh, children }: { fresh: boolean; children: ReactNode }) {
  return fresh ? <Appear>{children}</Appear> : children;
}
