import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { PressScale } from '@/components/motion';

import { familyById, type FamilyId } from '@/content/families';
import { tr } from '@/i18n';
import { colors } from '@/theme';

import { FamilySheet } from './FamilySheet';
import { GameIcon } from './GameIcon';
import { Text } from './Text';

/**
 * A family's icon, "×2" on it for a two-handed weapon, and its name unless
 * `named` is false. Tapping it opens the family sheet, unless `sheet` is false
 * (inside a tile that has its own tap).
 */
export function FamilyTag({
  family,
  count = 1,
  named = true,
  size = 16,
  sheet = true,
  labelStyle,
}: {
  family: FamilyId;
  /** The tags this one source gives: 2 on a two-handed weapon. */
  count?: number;
  named?: boolean;
  size?: number;
  sheet?: boolean;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const [open, setOpen] = useState(false);
  const def = familyById[family];
  const name = tr(def.name);
  const tag = (
    <View style={styles.tag}>
      <View style={count > 1 && { paddingRight: Math.round(size * 0.55) }}>
        <GameIcon emoji={def.emoji} icon={def.icon} size={size} />
        {count > 1 && <Text style={[styles.times, { fontSize: Math.max(10, Math.round(size * 0.7)), lineHeight: Math.max(11, Math.round(size * 0.75)) }]}>{`×${count}`}</Text>}
      </View>
      {named && <Text style={[styles.label, labelStyle]}>{name}</Text>}
    </View>
  );
  if (!sheet) return tag;
  return (
    <>
      <PressScale accessibilityRole="button" accessibilityLabel={count > 1 ? `${name} ×${count}` : name} onPress={() => setOpen(true)} hitSlop={6}>
        {tag}
      </PressScale>
      {open && <FamilySheet family={family} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A piece's family tags in a row: its type's (×2 on a two-handed weapon), then its relic's extra one. */
export function FamilyTags({
  tags,
  named = true,
  size = 16,
  sheet = true,
  style,
  labelStyle,
}: {
  tags: { family: FamilyId; count: number }[];
  named?: boolean;
  size?: number;
  sheet?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}) {
  if (tags.length === 0) return null;
  return (
    <View style={[styles.tags, style]} accessibilityLabel={tags.map((tag) => `${tr(familyById[tag.family].name)}${tag.count > 1 ? ` ×${tag.count}` : ''}`).join(', ')}>
      {tags.map((tag) => (
        <FamilyTag key={tag.family} family={tag.family} count={tag.count} named={named} size={size} sheet={sheet} labelStyle={labelStyle} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  times: { position: 'absolute', right: 0, bottom: -2, color: colors.ink, fontWeight: 'bold' },
  label: { fontSize: 14, color: colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
