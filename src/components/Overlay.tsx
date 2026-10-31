import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

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
 * inside the panel never close it — the panel swallows them.
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
  center: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottom: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
});

/**
 * The one overlay behind every drawer, dialog, modal, popover and sheet: a
 * dimmed backdrop that closes on tap (cancel semantics — never confirm), with
 * the panel kept safe from the tap so only its own buttons act.
 */
export function Overlay({ onClose, dismissOnBackdrop = true, position = 'center', backdropStyle, contentStyle, children }: Props) {
  const { backdrop, back } = overlayHandlers(onClose, dismissOnBackdrop);
  return (
    <Modal
      transparent
      statusBarTranslucent={position === 'center'}
      navigationBarTranslucent={position === 'center'}
      animationType={position === 'center' ? 'fade' : 'slide'}
      onRequestClose={back}
    >
      <Pressable style={[styles[position], backdropStyle]} onPress={backdrop}>
        <Pressable style={contentStyle} onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
