import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { motion } from '@/content/motion';
import { useMotion } from '@/hooks/useMotion';

const { small, medium } = motion.duration;
const { damping, stiffness, mass } = motion.spring.settle;

/** The library's own reduce-motion check is off: the level decides. */
const ANIMATIONS = {
  full: {
    top: FadeInUp.springify().damping(damping).stiffness(stiffness).mass(mass).reduceMotion(ReduceMotion.Never),
    bottom: FadeInDown.springify().damping(damping).stiffness(stiffness).mass(mass).reduceMotion(ReduceMotion.Never),
    exiting: FadeOut.duration(small).reduceMotion(ReduceMotion.Never),
    layout: LinearTransition.duration(small).reduceMotion(ReduceMotion.Never),
  },
  reduced: {
    top: FadeIn.duration(medium).reduceMotion(ReduceMotion.Never),
    bottom: FadeIn.duration(medium).reduceMotion(ReduceMotion.Never),
    exiting: FadeOut.duration(small).reduceMotion(ReduceMotion.Never),
    layout: undefined,
  },
};

type Props = {
  /** The screen edge it comes in from. */
  edge: 'top' | 'bottom';
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * A toast: it slides in from its edge and fades out when it unmounts (Full),
 * fades in and out (Reduced), or just shows (Off). Toasts sharing a column
 * (`ToastStack` in the root layout) move to their new place when one comes or
 * goes, instead of jumping.
 */
export function Toast({ edge, style, children }: Props) {
  const { level } = useMotion();
  const animations = level === 'off' ? undefined : ANIMATIONS[level];
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      entering={animations?.[edge]}
      exiting={animations?.exiting}
      layout={animations?.layout}
    >
      {children}
    </Animated.View>
  );
}
