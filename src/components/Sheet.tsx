import { useContext, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sheetMaxHeight } from '@/content/overlay';
import { colors, pixel, fonts, ui } from '@/theme';

import { SheetDrag } from './motion/OverlayPanel';
import { GameIcon } from './GameIcon';
import { IconLabel } from './IconLabel';
import { Text } from './Text';

type Props = {
  /** The sheet's fixed header; the title always shows, the subtitle under it. */
  title?: ReactNode;
  /** The icon beside the title, in its own element — never bake it into `title`. */
  emoji?: string;
  icon?: ImageSourcePropType;
  subtitle?: ReactNode;
  /** Extra style on the scrolling body's content. */
  bodyStyle?: StyleProp<ViewStyle>;
  /** The fixed footer: the action buttons, always visible and above the home indicator. */
  footer?: ReactNode;
  /** The sheet's scrolling body. */
  children: ReactNode;
  /** The map panels' look: parchment with a plank title band. */
  variant?: 'wood';
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
 * footer's inset padding lifts the buttons. Its header can be dragged down to
 * close it, when it sits in a bottom overlay.
 */
export function Sheet({ title, emoji, icon, subtitle, bodyStyle, footer, children, variant }: Props) {
  const { bottom } = useSafeAreaInsets();
  const maxHeight = useSheetMaxHeight();
  const wood = variant === 'wood';
  // The header is the sheet's handle: pulled down, it closes the sheet. The body keeps its own scrolling.
  const drag = useContext(SheetDrag);
  return (
    <View style={[styles.sheet, wood && styles.woodSheet, { maxHeight }]}>
      {wood && (
        <>
          <View style={styles.rimGap} pointerEvents="none" />
          <View style={styles.rim} pointerEvents="none" />
        </>
      )}
      {(title !== undefined || subtitle !== undefined) &&
        (wood ? (
          <View style={styles.band} {...drag}>
            <View style={styles.bandSeams} pointerEvents="none">
              {Array.from({ length: 6 }, (_, i) => (
                <View key={i} style={[styles.bandSeam, { top: (i + 1) * 14 }]} />
              ))}
            </View>
            {emoji !== undefined && (
              <View style={styles.bandIcon}>
                <GameIcon emoji={emoji} icon={icon} size={30} />
              </View>
            )}
            <View style={styles.bandText}>
              {title !== undefined && <Text style={styles.bandTitle}>{title}</Text>}
              {subtitle !== undefined && <Text style={styles.bandSub}>{subtitle}</Text>}
            </View>
          </View>
        ) : (
          <View style={styles.header} {...drag}>
            {title !== undefined &&
              (emoji ? (
                <IconLabel emoji={emoji} icon={icon} label={title} size={24} gap={6} labelStyle={styles.title} />
              ) : (
                <Text style={styles.title}>{title}</Text>
              ))}
            {subtitle !== undefined && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        ))}
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
  woodSheet: { backgroundColor: ui.parchment, borderWidth: 3, borderTopWidth: 3, borderColor: ui.outline },
  rimGap: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 2, borderColor: ui.parchment },
  rim: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderWidth: 2, borderColor: ui.brass },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: ui.woodMid,
    borderBottomWidth: 3,
    borderBottomColor: ui.outline,
  },
  bandSeams: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  bandSeam: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: ui.woodSeam },
  bandIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDeep,
    borderWidth: 2,
    borderColor: ui.brass,
  },
  bandText: { flexDirection: 'column', flexShrink: 1 },
  bandTitle: { fontSize: 23, color: ui.brassLight, lineHeight: 24 },
  bandSub: { fontFamily: fonts.serif, fontSize: 13, color: '#E2CFA4' },
  header: { paddingHorizontal: 16, paddingTop: 14, gap: 2 },
  title: { fontSize: 22 },
  subtitle: { fontSize: 16, color: colors.muted },
  scroll: { flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: footerBasePadding, gap: 8, flexDirection: 'row', justifyContent: 'flex-end' },
});
