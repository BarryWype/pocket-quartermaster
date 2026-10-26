import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Row } from '@/components/Row';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { heroClasses } from '@/content/heroes';
import { rosterRules } from '@/content/roster';
import { traitById } from '@/content/traits';
import { isOnExpedition } from '@/game/team/team';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

export default function TeamScreen() {
  const save = useGameStore((state) => state.save);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen="team" />
      <Text style={styles.roster}>
        Roster {save.heroes.length}/{rosterRules.rosterCap} · up to {rosterRules.partySize} per expedition
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
              subtitle={`${heroClass.name} · Level ${hero.level} · ${traitById[hero.trait]?.name ?? ''}${away ? ' · on expedition' : ''}`}
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
