import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { relicById } from '@/content/lookup';
import type { GearInstance } from '@/game/types';
import { t, tr } from '@/i18n';

import { affixIcon, affixLine } from './affixText';
import { IconLabel } from './IconLabel';

type Props = {
  piece: GearInstance;
  /** List rows show smaller lines. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

/** A piece's unique and each of its affixes, the effect's family icon beside its line. */
export function AffixLines({ piece, compact, style, labelStyle }: Props) {
  const unique = piece.relicId ?? piece.unique;
  const size = compact ? 15 : 18;
  if (!unique && piece.affixes.length === 0) return null;
  return (
    <View style={[styles.lines, style]}>
      {unique && (
        <IconLabel
          emoji="🏺"
          label={piece.relicId ? tr(relicById[piece.relicId].name) : t('gear.unique', { effect: tr(relicById[unique].effect) })}
          size={size}
          labelStyle={labelStyle}
        />
      )}
      {piece.affixes.map((affix, i) => {
        const icon = affixIcon(affix.id);
        return (
          <IconLabel
            key={i}
            emoji={icon.emoji}
            icon={icon.icon}
            label={affixLine(affix)}
            size={size}
            labelStyle={labelStyle}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  lines: { alignItems: 'flex-start', gap: 2 },
});
