import { StyleSheet, View } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { freePickProblem } from '@/game/taverns/freePick';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { ClassSummary } from './ClassSummary';
import { IconLabel } from './IconLabel';
import { Text } from './Text';
import { EmberButton } from './ui';

/** The free recruit after the first tier boss, while it waits: one of three classes, taken in one tap. */
export function FreePickPanel() {
  const save = useGameStore((state) => state.save);
  const claim = useGameStore((state) => state.claimFreePick);
  if (!save.freePick) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{t('freePick.title')}</Text>
      <Text style={styles.body}>{t('freePick.body')}</Text>
      {save.freePick.map((classId) => {
        const heroClass = heroClasses[classId];
        const problem = freePickProblem(save, classId);
        return (
          <View key={classId} style={styles.choice}>
            <IconLabel emoji={heroClass.emoji} icon={heroClass.icon} label={tr(heroClass.name)} labelStyle={styles.name} />
            <ClassSummary classId={classId} />
            <EmberButton title={t('freePick.take')} compact disabled={problem !== null} onPress={() => claim(classId)} />
            {problem === 'rosterFull' && <Text style={styles.problem}>{t('freePick.rosterFull')}</Text>}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 6, paddingVertical: 8 },
  title: { fontSize: 21 },
  body: { color: colors.muted },
  choice: { gap: 4, paddingVertical: 8, borderTopWidth: 2, borderTopColor: colors.parchmentDark },
  name: { fontSize: 20 },
  problem: { color: colors.muted, fontStyle: 'italic' },
});
