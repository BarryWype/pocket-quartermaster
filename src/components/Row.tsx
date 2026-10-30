import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { colors, pixel } from '@/theme';

import { GameIcon } from './GameIcon';
import { Text } from './Text';

type Props = {
  emoji: string;
  icon?: ImageSourcePropType;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  /** E.g. a gear piece's quality colour. */
  titleColor?: string;
  /** Small icons in the slot's corner, e.g. an item's purpose tags. */
  badge?: string;
  onPress?: () => void;
};

export function Row({ emoji, icon, title, subtitle, right, titleColor, badge, onPress }: Props) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <View>
        <IconSlot emoji={emoji} icon={icon} />
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, titleColor ? { color: titleColor } : null]}>{title}</Text>
        {typeof subtitle === 'string' ? <Text style={styles.subtitle}>{subtitle}</Text> : subtitle}
      </View>
      {typeof right === 'string' || typeof right === 'number' ? <Text style={styles.right}>{right}</Text> : right}
    </Pressable>
  );
}

/** An icon in a sunken inventory-style square. */
export function IconSlot({ emoji, icon, size = 32 }: { emoji: string; icon?: ImageSourcePropType; size?: number }) {
  return (
    <View style={styles.slot}>
      <GameIcon emoji={emoji} icon={icon} size={size} />
    </View>
  );
}

/** A wooden banner heading a section. */
export function SectionTitle({ children }: { children: string }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.section}>◆ {children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: colors.parchmentDark,
  },
  slot: {
    padding: 3,
    borderWidth: 2,
    borderColor: colors.woodDark,
    borderTopColor: colors.ink,
    borderLeftColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  body: { flex: 1 },
  title: { fontSize: 20 },
  subtitle: { fontSize: 17, color: colors.muted },
  right: { fontSize: 20 },
  badge: { position: 'absolute', right: -6, bottom: -6, fontSize: 13 },
  banner: {
    alignSelf: 'flex-start',
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.wood,
  },
  section: { fontSize: 22, color: colors.parchment },
});
