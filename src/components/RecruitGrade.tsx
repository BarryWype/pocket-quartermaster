import { StyleSheet } from 'react-native';

import { statArrows, type Grade } from '@/game/taverns/roll';
import type { HeroRoll, StatKey } from '@/game/types';
import { t } from '@/i18n';
import { colors } from '@/theme';

import { Text } from './Text';

type Props = { grade: Grade; roll: HeroRoll };

/** A recruit's grade with its per-stat arrows, as taverns and travellers offer them. */
export function RecruitGrade({ grade, roll }: Props) {
  return (
    <Text style={styles.muted}>
      {t('tavern.grade', { grade })}
      {(Object.entries(statArrows(roll)) as [StatKey, 'up' | 'down'][]).map(
        ([stat, dir]) => ` ${dir === 'up' ? '▲' : '▼'} ${t(`hero.statNames.${stat}`)}`,
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted },
});
