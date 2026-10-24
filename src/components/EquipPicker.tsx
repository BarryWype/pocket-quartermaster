import { Button, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { itemById } from '@/content/lookup';
import type { SaveData } from '@/game/save';
import type { EquipmentSlot } from '@/game/types';

import { Row } from './Row';

type Props = {
  save: SaveData;
  heroId: string;
  slot: EquipmentSlot;
  onPick: (id: string | null) => void;
  onClose: () => void;
};

type Option = { id: string; emoji: string; title: string; subtitle?: string };

function optionsFor(save: SaveData, heroId: string, slot: EquipmentSlot): Option[] {
  if (slot === 'consumable') {
    return Object.entries(save.consumables)
      .filter(([, count]) => count > 0)
      .map(([itemId, count]) => ({
        id: itemId,
        emoji: itemById[itemId].emoji,
        title: itemById[itemId].name,
        subtitle: `${count} in stock`,
      }));
  }
  return save.gear
    .filter((gear) => itemById[gear.itemId].slot === slot)
    .map((gear) => {
      const item = itemById[gear.itemId];
      const holder = save.heroes.find((h) => h.id !== heroId && h.equipment[slot] === gear.uid);
      const away = holder && save.expeditions.some((e) => e.heroIds.includes(holder.id));
      return { gear, item, holder, away };
    })
    .filter(({ away }) => !away)
    .map(({ gear, item, holder }) => ({
      id: gear.uid,
      emoji: item.emoji,
      title: item.name,
      subtitle: `Durability ${gear.durability}${holder ? ` · used by ${holder.name}` : ''}`,
    }));
}

export function EquipPicker({ save, heroId, slot, onPick, onClose }: Props) {
  const options = optionsFor(save, heroId, slot);

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Choose {slot}</Text>
          <ScrollView>
            <Pressable onPress={() => onPick(null)}>
              <Row emoji="🚫" title="Nothing" />
            </Pressable>
            {options.map((option) => (
              <Pressable key={option.id} onPress={() => onPick(option.id)}>
                <Row emoji={option.emoji} title={option.title} subtitle={option.subtitle} />
              </Pressable>
            ))}
            {options.length === 0 && <Text style={styles.empty}>Nothing available. Visit the forge.</Text>}
          </ScrollView>
          <Button title="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', padding: 16, maxHeight: '70%', gap: 8 },
  title: { fontSize: 18, fontWeight: '600' },
  empty: { color: '#666', paddingVertical: 8 },
});
