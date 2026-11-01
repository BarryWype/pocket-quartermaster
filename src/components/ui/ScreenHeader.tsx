import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { t } from '@/i18n';
import { fonts, ui } from '@/theme';

type Props = {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  backLabel?: string;
};

/** The plank screen bar: back button, centred title, optional right action. */
export function ScreenHeader({ title, onBack, right, backLabel }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.seams} pointerEvents="none">
        {Array.from({ length: 12 }, (_, i) => (
          <View key={i} style={[styles.seam, { top: (i + 1) * 16 }]} />
        ))}
      </View>
      <View style={styles.brassLine} pointerEvents="none" />
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel ?? t('common.back')}
          onPress={onBack ?? (() => router.back())}
          style={styles.back}
        >
          <View style={styles.backRim} pointerEvents="none" />
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {right ?? <View style={styles.spacer} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: ui.woodMid, borderBottomWidth: 3, borderBottomColor: ui.outline },
  seams: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  seam: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: ui.woodSeam },
  brassLine: { position: 'absolute', left: 0, right: 0, bottom: 3, height: 3, backgroundColor: ui.brass },
  row: { height: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDark,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  backRim: { position: 'absolute', top: 3, left: 3, bottom: 3, right: 3, borderWidth: 2, borderColor: ui.brass },
  backGlyph: { fontSize: 28, color: ui.brassLight, lineHeight: 30 },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: {
    fontSize: 30,
    color: ui.brassLight,
    fontFamily: fonts.body,
    textShadowColor: ui.outline,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  spacer: { width: 44 },
});
