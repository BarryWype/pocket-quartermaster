import { rosterRules } from '@/content/roster';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { STATS, statIcons } from '@/components/GearRow';
import { Button } from '@/components/Button';
import { HpBar } from '@/components/HpBar';
import { Panel } from '@/components/Panel';
import { IconSlot } from '@/components/Row';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { heroClasses } from '@/content/heroes';
import { traitById } from '@/content/traits';
import { heroStats, isOnExpedition } from '@/game/team/team';
import { pendingApproachPicks } from '@/game/team/stats';
import { rosterCap } from '@/game/guild/guild';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { navigate } from '@/services/navigation';
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
        {t('team.roster', { count: save.heroes.length, cap: rosterCap(save), party: rosterRules.partySize })}
      </Text>
      <View style={styles.classes}>
        <Button title={`📜 ${t('classes.link')}`} onPress={() => navigate('/team/classes')} />
      </View>
      {save.heroes.map((hero) => {
        const heroClass = heroClasses[hero.classId];
        const away = isOnExpedition(save, hero.id);
        const stats = heroStats(save, hero);
        const pending = pendingApproachPicks(hero);
        return (
          <Pressable
            key={hero.id}
            onPress={() => navigate({ pathname: '/team/[heroId]', params: { heroId: hero.id } })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Panel style={styles.card}>
              <IconSlot emoji={heroClass.emoji} size={44} />
              <View style={styles.body}>
                <View style={styles.titleLine}>
                  <Text style={styles.name}>{hero.name}</Text>
                  <Text style={styles.level}>{t('common.levelShort', { level: hero.level })}</Text>
                  {pending > 0 && <Text style={styles.pending}>{t('hero.pendingPicks', { count: pending })}</Text>}
                </View>
                <Text style={styles.muted}>
                  {tr(heroClass.name)} · {tr(traitById[hero.trait]?.name ?? '')}
                  {away ? t('common.onExpedition') : ''}
                  {save.escort?.heroId === hero.id ? t('common.escort') : ''}
                  {save.patrolFights.some((fight) => fight.heroIds.includes(hero.id)) ? t('common.patrol') : ''}
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
  classes: { alignItems: 'flex-start', paddingBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 22 },
  level: { paddingHorizontal: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.highlight, fontSize: 16 },
  pending: { paddingHorizontal: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.highlight, fontSize: 12 },
  muted: { color: colors.muted },
  stats: { fontSize: 17 },
  chevron: { fontSize: 28, color: colors.muted },
});
