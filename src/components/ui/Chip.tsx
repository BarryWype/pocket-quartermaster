import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { IconLabel } from '@/components/IconLabel';
import { Text } from '@/components/Text';
import { fonts, ui } from '@/theme';

export type ChipTone = 'good' | 'bad' | 'keyword' | 'neutral';

const TONES: Record<ChipTone, { color: string; bg: string }> = {
  good: { color: ui.good, bg: ui.goodBg },
  bad: { color: ui.bad, bg: ui.badBg },
  keyword: { color: ui.keyword, bg: ui.keywordBg },
  neutral: { color: ui.ink, bg: ui.parchmentShade },
};

type Props = {
  tone: ChipTone;
  label: string;
  emoji?: string;
  icon?: ImageSourcePropType;
};

/** A small tone-coloured tag: light fill, 2 px border in the tone colour. */
export function Chip({ tone, label, emoji, icon }: Props) {
  const { color, bg } = TONES[tone];
  return (
    <View style={[styles.chip, { borderColor: color, backgroundColor: bg }]}>
      {emoji !== undefined ? (
        <IconLabel emoji={emoji} icon={icon} label={label} size={13} labelStyle={[styles.label, { color }]} />
      ) : (
        <Text style={[styles.label, { color }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 2, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  label: { fontFamily: fonts.serifBold, fontSize: 13 },
});
