import type { ReactNode } from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { PressScale } from '@/components/motion';
import { GameIcon } from '@/components/GameIcon';
import { IconLabel } from '@/components/IconLabel';
import { Text } from '@/components/Text';
import { materialById } from '@/content/lookup';
import { fonts, ui } from '@/theme';

/** The stars of a site's or a building's quality: filled up to it, empty after. */
export const stars = (quality: 1 | 2 | 3) => `${'★'.repeat(quality)}${'☆'.repeat(3 - quality)}`;

/** Goods as icons with their counts, one element each (never an emoji and words in one Text). */
export function GoodsRow({ goods, mark = '', size = 16 }: { goods: Record<string, number>; mark?: string; size?: number }) {
  const entries = Object.entries(goods).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  return (
    <View style={styles.goods}>
      {entries.map(([id, n]) => (
        <IconLabel key={id} emoji={materialById[id]?.emoji ?? '📦'} icon={materialById[id]?.icon} label={`${mark}${n}`} size={size} labelStyle={styles.goodText} />
      ))}
    </View>
  );
}

/** A label and its value, as a definition row. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{typeof children === 'string' ? <Text style={styles.value}>{children}</Text> : children}</View>
    </View>
  );
}

/**
 * A hero's portrait slot: the class icon in a brass frame, or "+" when empty.
 * Tapping it is how a hero is chosen; its label says what the tap does.
 */
export function PortraitSlot({
  emoji,
  icon,
  caption,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  emoji?: string;
  icon?: ImageSourcePropType;
  caption?: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const filled = emoji !== undefined || icon !== undefined;
  return (
    <View style={styles.slotColumn}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={onPress}
        style={[styles.slot, !filled && styles.slotEmpty, disabled && styles.slotDisabled]}
      >
        {filled ? <GameIcon emoji={emoji ?? ''} icon={icon} size={34} /> : <Text style={styles.plus}>+</Text>}
      </PressScale>
      {caption && <Text style={styles.caption}>{caption}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  goods: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  goodText: { color: ui.ink },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowLabel: { width: 96, color: ui.inkMuted, fontSize: 16 },
  rowValue: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  value: { color: ui.ink, fontSize: 16 },
  slotColumn: { alignItems: 'center', gap: 4 },
  slot: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDeep,
    borderWidth: 3,
    borderColor: ui.brass,
  },
  slotEmpty: { backgroundColor: ui.parchmentShade, borderStyle: 'dashed', borderColor: ui.brassDim },
  slotDisabled: { opacity: 0.6 },
  plus: { fontSize: 26, color: ui.inkMuted, fontFamily: fonts.serifBold },
  caption: { fontSize: 15, color: ui.ink },
});
