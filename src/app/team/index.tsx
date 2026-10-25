import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Row } from '@/components/Row';
import { Text } from '@/components/Text';
import { heroClasses } from '@/content/heroes';
import { isOnExpedition } from '@/game/team/team';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

export default function TeamScreen() {
  const save = useGameStore((state) => state.save);

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
              subtitle={`${heroClass.name} · Level ${hero.level}${away ? ' · on expedition' : ''}`}
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
  chevron: { fontSize: 28, color: colors.muted },
});
