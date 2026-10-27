import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, pixel } from '@/theme';

import { Text } from './Text';

type Props = {
  title?: string;
  text: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type Anchor = { x: number; y: number; width: number; height: number };

const BUBBLE_WIDTH = 260;
const GAP = 6;

/** Wraps an icon or label: tapping it shows a tooltip bubble next to it; tapping anywhere closes it. */
export function Tip({ title, text, children, style }: Props) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const window = useWindowDimensions();

  const open = () => ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));

  let position: ViewStyle | null = null;
  if (anchor) {
    const left = Math.min(Math.max(12, anchor.x + anchor.width / 2 - BUBBLE_WIDTH / 2), window.width - BUBBLE_WIDTH - 12);
    // Below the anchor in the top half of the screen, above it in the bottom half.
    position =
      anchor.y < window.height / 2
        ? { left, top: anchor.y + anchor.height + GAP }
        : { left, bottom: window.height - anchor.y + GAP };
  }

  return (
    <>
      <Pressable ref={ref} accessibilityRole="button" accessibilityHint={text} onPress={open} hitSlop={6} style={style}>
        {children}
      </Pressable>
      {anchor && (
        <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setAnchor(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)}>
            <View style={[styles.bubble, position]}>
              {title && <Text style={styles.title}>{title}</Text>}
              <Text style={styles.text}>{text}</Text>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: BUBBLE_WIDTH,
    padding: 10,
    gap: 2,
    borderWidth: pixel.outline,
    borderColor: colors.parchment,
    backgroundColor: colors.ink,
    elevation: 8,
  },
  title: { color: colors.highlight, fontSize: 19 },
  text: { color: colors.parchment, fontSize: 17 },
});
