import { useState } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cubicBezier } from 'react-native-reanimated';

import { motion } from '@/content/motion';
import { useMotion } from '@/hooks/useMotion';
import { feel } from '@/services/feel';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ease = cubicBezier(...motion.easing.out);

/**
 * The press scale as CSS transitions: the native side eases between the two
 * styles, with no shared value or worklet per button (a screen holds dozens).
 * Going down takes the press duration; coming back, the small one.
 */
const DOWN = { transform: [{ scale: motion.pressScale }], transitionProperty: 'transform', transitionDuration: motion.duration.press, transitionTimingFunction: ease } as const;
const UP = { transform: [{ scale: 1 }], transitionProperty: 'transform', transitionDuration: motion.duration.small, transitionTimingFunction: ease } as const;

type Props = Omit<PressableProps, 'style'> & {
  /** A plain style: the pressed look goes in the children, as `({ pressed }) => …`. */
  style?: StyleProp<ViewStyle>;
  /** The press haptic; off for a control that plays its own moment (a switch). */
  haptic?: boolean;
};

/**
 * A `Pressable` that answers the finger: at the Full level it shrinks a little
 * on press-in and eases back on release; below it, only the control's own
 * pressed look shows. A press plays `feel('press')`. A disabled one gets no
 * press events, so it never moves or buzzes.
 */
export function PressScale({ style, onPressIn, onPressOut, onPress, haptic = true, ...props }: Props) {
  const { level } = useMotion();
  const [down, setDown] = useState(false);

  const pressIn = (event: GestureResponderEvent) => {
    if (level === 'full') setDown(true);
    onPressIn?.(event);
  };
  const pressOut = (event: GestureResponderEvent) => {
    if (down) setDown(false);
    onPressOut?.(event);
  };
  const press = (event: GestureResponderEvent) => {
    if (haptic) feel('press');
    onPress?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={onPress && press}
      style={[style, level === 'full' && (down ? DOWN : UP)]}
    />
  );
}
