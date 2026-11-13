import { StyleSheet, View } from 'react-native';

import { clockConfig } from '@/content/clockConfig';
import { jobRules } from '@/content/jobs';
import { currentEnergy, isTired } from '@/game/jobs/jobs';
import type { SaveData } from '@/game/save';
import type { HeroState } from '@/game/types';
import { t } from '@/i18n';
import { colors } from '@/theme';
import { useNow } from '@/hooks/useNow';

import { IconLabel } from './IconLabel';
import { FillBar } from '@/components/motion';
import { Text } from './Text';

type Props = {
  save: SaveData;
  hero: HeroState;
};

/** A hero's energy now (0–100): drained while working, regained otherwise, with the tired mark while they rest at their station. */
export function EnergyBar({ save, hero }: Props) {
  // Its own clock, so the bar ticks without re-rendering the screen around it.
  const now = useNow(clockConfig.minutesMs);
  const energy = currentEnergy(save, hero, now);
  const tired = isTired(save, hero, now);
  return (
    <View>
      <FillBar value={energy / jobRules.energy.max} color={tired ? colors.danger : colors.gold} />
      <View style={styles.row}>
        <IconLabel emoji="⚡" label={t('jobs.energy', { value: Math.round(energy), max: jobRules.energy.max })} labelStyle={styles.text} />
        {tired && (
          <Text style={styles.text}> · {t('jobs.tired')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  text: { fontSize: 16, color: colors.muted },
});
