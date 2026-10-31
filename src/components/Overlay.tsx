import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** Where the panel sits; it decides the animation and the dimming. */
export type OverlayPosition = 'center' | 'bottom';

type Props = {
  /** What closing means: the backdrop tap, Android's back button and the panel's own Close button all lead here. */
  onClose: () => void;
  /** Set to false when the overlay must be answered first: the dimmed backdrop and the back button then do nothing. */
  dismissOnBackdrop?: boolean;
  position?: OverlayPosition;
  /** Extra style on the dimmed backdrop (e.g. a heavier dim). */
  backdropStyle?: StyleProp<ViewStyle>;
  /** Style on the wrapper around the panel. */
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * How the overlay answers dismissals. The backdrop tap closes (or is ignored
 * when the overlay must be answered), the back button follows suit, and taps
 * inside the panel never close it — the panel is a plain view.
 */
export function overlayHandlers(onClose: () => void, dismissOnBackdrop: boolean): {
  backdrop: (() => void) | undefined;
  back: () => void;
} {
  return {
    backdrop: dismissOnBackdrop ? onClose : undefined,
    back: dismissOnBackdrop ? onClose : () => {},
  };
}

const styles = StyleSheet.create({
  /** The full-screen frame: the backdrop behind, the panel's slot in front. */
  frame: { flex: 1 },
  /** The dimmed backdrop fills the screen, behind the panel — taps on it close. */
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dimCenter: { backgroundColor: 'rgba(0,0,0,0.5)' },
  dimBottom: { backgroundColor: 'rgba(0,0,0,0.4)' },
  /** The panel's slot: it never takes a touch itself (box-none), so taps
   * outside the panel reach the backdrop and views inside the panel (a
   * ScrollView, a swipe) keep their own gestures. */
  layoutCenter: { flex: 1, justifyContent: 'center', padding: 16, pointerEvents: 'box-none' },
  layoutBottom: { flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' },
});

/**
 * The one overlay behind every drawer, dialog, modal, popover and sheet: a
 * dimmed backdrop behind the panel that closes on tap (cancel semantics —
 * never confirm), with the panel a plain sibling in front, kept safe from the
 * tap so only its own buttons act and its own gestures (scroll, swipe) work.
 * The modal spans the whole screen (status bar and navigation bar too), so a
 * bottom sheet can touch the very bottom and pad its footer for the insets.
 */
export function Overlay({ onClose, dismissOnBackdrop = true, position = 'center', backdropStyle, contentStyle, children }: Props) {
  const { backdrop, back } = overlayHandlers(onClose, dismissOnBackdrop);
  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType={position === 'center' ? 'fade' : 'slide'}
      onRequestClose={back}
    >
      <View style={styles.frame}>
        <Pressable style={[styles.backdrop, position === 'center' ? styles.dimCenter : styles.dimBottom, backdropStyle]} onPress={backdrop} />
        <View style={[position === 'center' ? styles.layoutCenter : styles.layoutBottom, contentStyle]}>{children}</View>
      </View>
    </Modal>
  );
}
