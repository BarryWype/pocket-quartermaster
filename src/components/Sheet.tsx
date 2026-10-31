import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sheetMaxHeight } from '@/content/overlay';
import { colors, pixel } from '@/theme';

import { IconLabel } from './IconLabel';
import { Text } from './Text';

type Props = {
  /** The sheet's fixed header; the title always shows, the subtitle under it. */
  title?: ReactNode;
  /** The icon beside the title, in its own element — never bake it into `title`. */
  emoji?: string;
  subtitle?: ReactNode;
  /** Extra style on the scrolling body's content. */
  bodyStyle?: StyleProp<ViewStyle>;
  /** The fixed footer: the action buttons, always visible and above the home indicator. */
  footer?: ReactNode;
  /** The sheet's scrolling body. */
  children: ReactNode;
};

/**
 * The tallest a sheet or dialog may grow, in pixels: the window's height minus
 * the top safe-area inset and the margin above it, capped at the rules' share
 * of the window. Never a percentage — that would answer to a parent with no
 * height of its own.
 */
export function useSheetMaxHeight(): number {
  const { height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  return sheetMaxHeight(height, top);
}

/**
 * The one bottom sheet behind every map panel and picker: a fixed header, a
 * body that scrolls when the content outgrows the sheet, and a fixed footer
 * raised above the home indicator or navigation bar. The sheet sizes to its
 * content up to `useSheetMaxHeight` — a short list (the equip picker) shows all
 * its rows, a long one (the patrol panel) scrolls — and it touches the bottom
 * of the screen: the overlay's modal spans the whole screen, so only the
 * footer's inset padding lifts the buttons.
 */
export function Sheet({ title, emoji, subtitle, bodyStyle, footer, children }: Props) {
  const { bottom } = useSafeAreaInsets();
  const maxHeight = useSheetMaxHeight();
  return (
    <View style={[styles.sheet, { maxHeight }]}>
      {(title !== undefined || subtitle !== undefined) && (
        <View style={styles.header}>
          {title !== undefined &&
            (emoji ? (
              <IconLabel emoji={emoji} label={title} size={24} gap={6} labelStyle={styles.title} />
            ) : (
              <Text style={styles.title}>{title}</Text>
            ))}
          {subtitle !== undefined && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.body, bodyStyle]}>
        {children}
      </ScrollView>
      {footer !== undefined && <View style={[styles.footer, { paddingBottom: bottom + footerBasePadding }]}>{footer}</View>}
    </View>
  );
}

/** The footer's own bottom padding, before the safe-area inset adds to it. */
const footerBasePadding = 14;

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.parchment,
    borderTopWidth: pixel.outline + 1,
    borderColor: colors.ink,
  },
  header: { paddingHorizontal: 16, paddingTop: 14, gap: 2 },
  title: { fontSize: 22 },
  subtitle: { fontSize: 16, color: colors.muted },
  scroll: { flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: footerBasePadding, gap: 8, flexDirection: 'row', justifyContent: 'flex-end' },
});
