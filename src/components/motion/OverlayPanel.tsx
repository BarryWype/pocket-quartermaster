import { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, View, useWindowDimensions, type GestureResponderHandlers, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { motion } from '@/content/motion';
import { spring, timing, useMotion } from '@/hooks/useMotion';

/** The drag handlers a bottom sheet puts on its header, so it can be pulled down to close. Null outside a bottom overlay. */
export const SheetDrag = createContext<GestureResponderHandlers | null>(null);

type Props = {
  position: 'center' | 'bottom';
  /** False for a panel that animates itself (a popup growing from its anchor). */
  animated: boolean;
  /** What a drag past the threshold does; without it a dragged sheet springs back. */
  onDragClose?: () => void;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * The overlay's panel slot. At the Full level a bottom panel slides up from
 * below the screen with the settle spring, and a centred one fades in from a
 * little smaller; below Full only the modal's own fade shows. The content
 * renders on the first frame either way. A bottom panel's header can be
 * dragged down (`SheetDrag`): past the threshold it closes, else it springs back.
 */
export function OverlayPanel({ position, animated, onDragClose, style, children }: Props) {
  const { level } = useMotion();
  const { height } = useWindowDimensions();
  const moving = animated && level === 'full';
  const shown = useSharedValue(moving ? 0 : 1);
  const rise = useSharedValue(moving && position === 'bottom' ? height : 0);
  const drag = useSharedValue(0);
  const measured = useRef(false);
  const latest = useRef({ level, onDragClose });
  useEffect(() => {
    latest.current = { level, onDragClose };
  });

  useEffect(() => {
    if (moving && position === 'center') shown.set(withTiming(1, timing('medium')));
    // It opens once, when it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slides up by its own height, known once it has been laid out (it starts below the screen).
  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    if (!moving || measured.current) return;
    measured.current = true;
    rise.set(withSequence(withTiming(nativeEvent.layout.height, { duration: 0 }), withSpring(0, spring('settle'))));
  };

  // The responder's callbacks read `latest` only during a drag, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    const settle = () => drag.set(latest.current.level === 'full' ? withSpring(0, spring('settle')) : 0);
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) => dy > 6 && Math.abs(dy) > Math.abs(dx),
      onPanResponderMove: (_, { dy }) => drag.set(Math.max(0, dy)),
      onPanResponderRelease: (_, { dy, vy }) => {
        const { closeDistance, closeVelocity } = motion.sheetDrag;
        const close = latest.current.onDragClose;
        // Closing leaves the sheet where the finger let go: the modal's own fade takes it from there.
        if (close && (dy > closeDistance || vy > closeVelocity)) close();
        else settle();
      },
      onPanResponderTerminate: settle,
    });
  });

  const centred = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: motion.dialogScale + (1 - motion.dialogScale) * shown.value }] }));
  const sliding = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value + drag.value }] }));

  if (position === 'center') return <Animated.View style={[style, centred]}>{children}</Animated.View>;
  return (
    <View style={style}>
      <Animated.View style={sliding} onLayout={onLayout}>
        <SheetDrag.Provider value={responder.panHandlers}>{children}</SheetDrag.Provider>
      </Animated.View>
    </View>
  );
}
