import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EquipPicker } from '@/components/EquipPicker';
import { Row } from '@/components/Row';
import { heroClasses, xpToNextLevel } from '@/content/heroes';
import { itemById } from '@/content/lookup';
import { heroStats, isOnExpedition } from '@/game/team/team';
import type { EquipmentSlot, HeroState } from '@/game/types';
import { useGameStore } from '@/store/gameStore';

const SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'consumable'];

export default function TeamScreen() {
  const save = useGameStore((state) => state.save);
  const equip = useGameStore((state) => state.equip);
  const [picking, setPicking] = useState<{ heroId: string; slot: EquipmentSlot } | null>(null);

  const slotLabel = (hero: HeroState, slot: EquipmentSlot) => {
    const id = hero.equipment[slot];
    if (!id) return 'Empty';
    if (slot === 'consumable') return `${itemById[id].emoji} ${itemById[id].name}`;
    const gear = save.gear.find((g) => g.uid === id);
    return gear ? `${itemById[gear.itemId].emoji} ${itemById[gear.itemId].name} (${gear.durability})` : 'Empty';
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {save.heroes.map((hero) => {
        const heroClass = heroClasses[hero.classId];
        const stats = heroStats(save, hero);
        const away = isOnExpedition(save, hero.id);
        return (
          <View key={hero.id} style={styles.card}>
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
                <Text style={styles.slotValue}>{slotLabel(hero, slot)}</Text>
                <Button title="Change" disabled={away} onPress={() => setPicking({ heroId: hero.id, slot })} />
              </View>
            ))}
          </View>
        );
      })}

      {picking && (
        <EquipPicker
          save={save}
          heroId={picking.heroId}
          slot={picking.slot}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            equip(picking.heroId, picking.slot, id);
            setPicking(null);
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  card: { borderWidth: 2, borderColor: '#3b2a1a', padding: 12, backgroundColor: '#f4ead2' },
  stats: { fontSize: 15, marginVertical: 8 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  slotName: { width: 90, textTransform: 'capitalize', color: '#666' },
  slotValue: { flex: 1 },
});
