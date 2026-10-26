import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Row } from '@/components/Row';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { heroClasses } from '@/content/heroes';
import { traitById } from '@/content/traits';
import { isOnExpedition } from '@/game/team/team';
import { partySize, rosterCap } from '@/game/guild/guild';
import { useLanguage } from '@/hooks/useLanguage';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

export default function TeamScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen="team" />
      <Text style={styles.roster}>
        {t('team.roster', { count: save.heroes.length, cap: rosterCap(save), party: partySize(save) })}
      </Text>
      {save.heroes.map((hero) => {
        const heroClass = heroClasses[hero.classId];
        const away = isOnExpedition(save, hero.id);
        return (
          <Pressable
            key={hero.id}
            onPress={() => router.push({ pathname: '/team/[heroId]', params: { heroId: hero.id } })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Row
              emoji={heroClass.emoji}
              title={hero.name}
              subtitle={`${tr(heroClass.name)} · ${t('common.level', { level: hero.level })} · ${tr(traitById[hero.trait]?.name ?? '')}${away ? t('common.onExpedition') : ''}`}
              right={<Text style={styles.chevron}>›</Text>}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  pressed: { opacity: 0.6 },
  roster: { color: colors.muted, paddingBottom: 4 },
  chevron: { fontSize: 28, color: colors.muted },
});
