import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { familyById, type FamilyId } from '@/content/families';
import { threatById } from '@/content/lookup';
import { tagsForLevel } from '@/game/families/strip';
import { t, tr, type TextKey } from '@/i18n';
import { colors } from '@/theme';

import { GameIcon } from './GameIcon';
import { IconLabel } from './IconLabel';
import { Text } from './Text';

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

/** A family's three levels: what each needs and does; the reached ones highlighted and the next one with its missing tags. */
export function FamilyLevelLines({ family, count }: { family: FamilyId; /** The party's tags, when there is a party. */ count?: number }) {
  const def = familyById[family];
  return (
    <View style={styles.levels}>
      {[1, 2, 3].map((level) => {
        const needed = tagsForLevel(level);
        const reached = count !== undefined && count >= needed;
        const isNext = count !== undefined && !reached && (level === 1 || count >= tagsForLevel(level - 1));
        return (
          <View key={level} style={[styles.level, reached && styles.reached]}>
            <View style={styles.levelHead}>
              <Text style={[styles.levelTitle, reached && styles.reachedText]}>{t('families.level', { level, count: needed })}</Text>
              {isNext && <Text style={styles.toReach}>{t('families.toReach', { count: needed - count })}</Text>}
            </View>
            {def.answers && <Text style={styles.effect}>{t('families.answers', { threat: tr(threatById[def.answers].name), level })}</Text>}
            <Text style={styles.effect}>{t(`families.effects.${family}${level}` as TextKey)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, color: colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  levels: { gap: 6 },
  level: { gap: 2, padding: 6, borderWidth: 2, borderColor: colors.parchmentDark },
  reached: { borderColor: colors.gold, backgroundColor: colors.highlight },
  levelHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  levelTitle: { fontSize: 16, color: colors.muted },
  reachedText: { color: colors.ink },
  toReach: { fontSize: 15, color: colors.danger },
  effect: { fontSize: 17 },
});
