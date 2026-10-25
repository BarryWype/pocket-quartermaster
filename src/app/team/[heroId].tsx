import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { EquipPicker } from '@/components/EquipPicker';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Row } from '@/components/Row';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { heroClasses, xpToNextLevel } from '@/content/heroes';
import { gearName, itemById } from '@/content/lookup';
import { heroStats, isOnExpedition } from '@/game/team/team';
import type { EquipmentSlot } from '@/game/types';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

const SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'consumable'];

export default function CharacterSheetScreen() {
  const { heroId } = useLocalSearchParams<{ heroId: string }>();
  const save = useGameStore((state) => state.save);
  const equip = useGameStore((state) => state.equip);
  const [picking, setPicking] = useState<EquipmentSlot | null>(null);

  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return <PlaceholderScreen title="Unknown hero" description="This hero is not in your team." />;

  const heroClass = heroClasses[hero.classId];
  const stats = heroStats(save, hero);
  const away = isOnExpedition(save, hero.id);

  const slotLabel = (slot: EquipmentSlot) => {
    const id = hero.equipment[slot];
    if (!id) return 'Empty';
    if (slot === 'consumable') return `${itemById[id].emoji} ${itemById[id].name}`;
    const gear = save.gear.find((g) => g.uid === id);
    return gear ? `${itemById[gear.itemId].emoji} ${gearName(gear)} (${gear.durability})` : 'Empty';
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: hero.name }} />
      <TutorialHint screen="hero" />
      <View style={styles.card}>
        <Row
          emoji={heroClass.emoji}
          title={`${hero.name} · ${heroClass.name}`}
          subtitle={`Level ${hero.level} · XP ${hero.xp}/${xpToNextLevel(hero.level)}${away ? ' · on expedition' : ''}`}
        />
        <Text style={styles.stats}>
          ⚔️ {stats.attack}   🛡️ {stats.defense}   ✨ {stats.magic}   ❤️ {stats.hp}
        </Text>
        {SLOTS.map((slot) => (
          <View key={slot} style={styles.slot}>
            <Text style={styles.slotName}>{slot}</Text>
            <Text style={styles.slotValue}>{slotLabel(slot)}</Text>
            <Button title="Change" disabled={away} onPress={() => setPicking(slot)} />
          </View>
        ))}
        {away && <Text style={styles.hint}>Equipment can be changed once the hero is back.</Text>}
      </View>

      {picking && (
        <EquipPicker
          save={save}
          heroId={hero.id}
          slot={picking}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            equip(hero.id, picking, id);
            setPicking(null);
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  card: { borderWidth: 2, borderColor: colors.ink, borderRadius: 16, padding: 12, backgroundColor: colors.parchment },
  stats: { fontSize: 15, marginVertical: 8 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  slotName: { width: 90, textTransform: 'capitalize', color: colors.muted },
  slotValue: { flex: 1 },
  hint: { color: colors.muted, marginTop: 8 },
});
