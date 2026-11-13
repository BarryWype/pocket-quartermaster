import { cubicBezier } from 'react-native-reanimated';

import { motion, type MotionDuration, type MotionLevel } from '@/content/motion';

const curves = {
  out: cubicBezier(...motion.easing.out),
  inOut: cubicBezier(...motion.easing.inOut),
};

/**
 * A native transition on `transform`, for a style that only moves between
 * places (a selected marker, a switch knob): the native side eases each change,
 * with no shared value or worklet per view. Full only; below it the change jumps.
 * Only changes after mount move, so a view takes its first place at once.
 */
export function transformTransition(level: MotionLevel, duration: MotionDuration = 'small', easing: keyof typeof curves = 'inOut') {
  return level === 'full'
    ? ({ transitionProperty: 'transform', transitionDuration: motion.duration[duration], transitionTimingFunction: curves[easing] } as const)
    : null;
}
