import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Overlay } from '@/components/Overlay';
import { motion } from '@/content/motion';
import { timing, useMotion } from '@/hooks/useMotion';

/** The tapped slot's place in the window, so the pop-up can open beside it. */
export type PopupAnchor = { x: number; y: number; width: number; height: number };

type Props = {
  anchor: PopupAnchor | null;
  onClose: () => void;
  /** Draws the card once its pointer side and offset are known. */
  render: (pointer: { side: 'top' | 'bottom'; x: number } | undefined) => ReactElement;
};

/**
 * A pop-up card opened beside the tapped slot, with its pointer at it, or
 * centred when there is no anchor. Its height is measured so a tall card can
 * be kept on screen, and it stays invisible until then. At the Full level it
 * then grows out of the slot it points at.
 */
export function AnchoredPopup({ anchor, onClose, render }: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [popupHeight, setPopupHeight] = useState(0);
  const insets = useSafeAreaInsets();

  // The card opens beside the tapped slot when anchored, centred otherwise.
  const width = Math.min(windowWidth - 24, 300);
  const centreX = anchor ? anchor.x + anchor.width / 2 : 0;
  const left = anchor ? Math.min(Math.max(centreX - width / 2, 12), windowWidth - width - 12) : 0;
  const below = anchor ? anchor.y + anchor.height / 2 < windowHeight * 0.55 : false;
  // Kept on screen once its height is known: a tall card may slide away from its slot.
  const wantedTop = anchor ? (below ? anchor.y + anchor.height + 12 : anchor.y - 12 - popupHeight) : 0;
  const top = Math.max(insets.top + 8, Math.min(wantedTop, windowHeight - insets.bottom - 8 - popupHeight));
  const placement: ViewStyle = anchor ? { position: 'absolute', left, top, width } : { width, alignSelf: 'center' };
  const pointer = anchor ? { side: below ? ('top' as const) : ('bottom' as const), x: centreX - left } : undefined;

  const { level } = useMotion();
  const placed = !anchor || popupHeight > 0;
  const grow = level === 'full';
  const shown = useSharedValue(grow ? 0 : 1);
  useEffect(() => {
    if (placed && grow) shown.set(withTiming(1, timing('medium')));
  }, [placed, grow, shown]);
  const growing = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: motion.popupScale + (1 - motion.popupScale) * shown.value }] }));
  const origin: ViewStyle = { transformOrigin: pointer ? `${pointer.x}px ${pointer.side === 'top' ? '0%' : '100%'}` : 'center' };

  return (
    <Overlay onClose={onClose} contentStyle={{ justifyContent: 'flex-start', padding: 0 }} panelMotion={false}>
      <View
        style={[placement, anchor && popupHeight === 0 && styles.measuring]}
        onLayout={({ nativeEvent }) => setPopupHeight(nativeEvent.layout.height)}
      >
        <Animated.View style={[origin, growing]}>{render(pointer)}</Animated.View>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({ measuring: { opacity: 0 } });
