import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { STATS, statIcons } from '@/components/GearRow';
import { HpBar } from '@/components/HpBar';
import { Panel } from '@/components/Panel';
import { IconSlot } from '@/components/Row';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { heroClasses } from '@/content/heroes';
import { traitById } from '@/content/traits';
import { heroStats, isOnExpedition } from '@/game/team/team';
import { partySize, rosterCap } from '@/game/guild/guild';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

export default function TeamScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const now = useNow();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen="team" />
      <Text style={styles.roster}>
        {t('team.roster', { count: save.heroes.length, cap: rosterCap(save), party: partySize(save) })}
      </Text>
      {save.heroes.map((hero) => {
        const heroClass = heroClasses[hero.classId];
        const away = isOnExpedition(save, hero.id);
        const stats = heroStats(save, hero);
        return (
          <Pressable
            key={hero.id}
            onPress={() => router.push({ pathname: '/team/[heroId]', params: { heroId: hero.id } })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Panel style={styles.card}>
              <IconSlot emoji={heroClass.emoji} size={44} />
              <View style={styles.body}>
                <View style={styles.titleLine}>
                  <Text style={styles.name}>{hero.name}</Text>
                  <Text style={styles.level}>{t('common.levelShort', { level: hero.level })}</Text>
                </View>
                <Text style={styles.muted}>
                  {tr(heroClass.name)} · {tr(traitById[hero.trait]?.name ?? '')}
                  {away ? t('common.onExpedition') : ''}
                </Text>
                <Text style={styles.stats}>{STATS.map((stat) => `${statIcons[stat]} ${stats[stat]}`).join('  ')}</Text>
                <HpBar save={save} hero={hero} now={now} />
              </View>
              <Text style={styles.chevron}>›</Text>
            </Panel>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  pressed: { opacity: 0.6 },
  roster: { color: colors.muted, paddingBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 22 },
  level: { paddingHorizontal: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.highlight, fontSize: 16 },
  muted: { color: colors.muted },
  stats: { fontSize: 17 },
  chevron: { fontSize: 28, color: colors.muted },
});
