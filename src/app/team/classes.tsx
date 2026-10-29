import { ScrollView, StyleSheet, View } from 'react-native';

import { ClassSummary } from '@/components/ClassSummary';
import { Panel } from '@/components/Panel';
import { IconSlot } from '@/components/Row';
import { Text } from '@/components/Text';
import { heroClasses } from '@/content/heroes';
import type { HeroClassId } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

/** Every class, by family; the ones never offered or recruited stay hidden as not met yet. */
export default function ClassesScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const met = new Set<HeroClassId>([...save.seenClasses, ...save.heroes.map((h) => h.classId)]);
  const classIds = Object.keys(heroClasses) as HeroClassId[];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.muted}>
        {met.size}/{classIds.length}
      </Text>
      {classIds.map((classId) => {
        const def = heroClasses[classId];
        const known = met.has(classId);
        return (
          <Panel key={classId} style={styles.card} borderColor={def.rarity === 'rare' ? colors.gold : colors.ink}>
            <IconSlot emoji={known ? def.emoji : '❔'} size={44} />
            <View style={styles.body}>
              <Text style={styles.name}>{known ? tr(def.name) : t('classes.notMet')}</Text>
              {known ? (
                <ClassSummary classId={classId} />
              ) : (
                <Text style={styles.muted}>
                  {t(`classes.family.${def.family}`)}
                  {def.rarity === 'rare' ? ` · ✦ ${t('classes.rare')}` : ''}
                </Text>
              )}
            </View>
          </Panel>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 21 },
  muted: { color: colors.muted },
});
