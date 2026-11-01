import { StyleSheet, View } from 'react-native';

import { difficultyLabels, type Difficulty } from '@/content/difficulty';
import { frDifficultyLabels } from '@/content/fr/difficulty';
import { localized } from '@/i18n';
import { difficultyTokens, fonts, ui } from '@/theme';

import { Text } from '@/components/Text';

import { DifficultyPips } from './DifficultyPips';

/** The difficulty as a panel, card or report chip: ring-coloured border, pips, label. */
export function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
  const token = difficultyTokens[difficulty];
  const label = localized({ en: difficultyLabels, fr: frDifficultyLabels })[difficulty];
  return (
    <View style={[styles.chip, { borderColor: token.ring }]}>
      <DifficultyPips difficulty={difficulty} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  label: { fontFamily: fonts.serifBold, fontSize: 13, color: ui.ink },
});
