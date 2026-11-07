import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { familyById, type FamilyId } from '@/content/families';
import { tr } from '@/i18n';
import { colors } from '@/theme';

import { GameIcon } from './GameIcon';
import { IconLabel } from './IconLabel';

/** A family's icon beside its name, or beside "×2" alone when `named` is false. */
export function FamilyTag({
  family,
  count = 1,
  named = true,
  size = 16,
  labelStyle,
}: {
  family: FamilyId;
  count?: number;
  named?: boolean;
  size?: number;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const def = familyById[family];
  const times = count > 1 ? `×${count}` : '';
  if (!named && !times) return <GameIcon emoji={def.emoji} icon={def.icon} size={size} />;
  const label = named ? [tr(def.name), times].filter(Boolean).join(' ') : times;
  return <IconLabel emoji={def.emoji} icon={def.icon} label={label} size={size} gap={3} labelStyle={[styles.label, labelStyle]} />;
}

/** A piece's family tags in a row: its type's (×2 on a two-handed weapon), then its relic's extra one. */
export function FamilyTags({
  tags,
  named = true,
  size = 16,
  style,
  labelStyle,
}: {
  tags: { family: FamilyId; count: number }[];
  named?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}) {
  if (tags.length === 0) return null;
  return (
    <View style={[styles.tags, style]} accessibilityLabel={tags.map((tag) => `${tr(familyById[tag.family].name)}${tag.count > 1 ? ` ×${tag.count}` : ''}`).join(', ')}>
      {tags.map((tag) => (
        <FamilyTag key={tag.family} family={tag.family} count={tag.count} named={named} size={size} labelStyle={labelStyle} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, color: colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
