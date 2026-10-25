import { Modal, Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { gearName, itemById } from '@/content/lookup';
import type { SaveData } from '@/game/save';
import type { EquipmentSlot } from '@/game/types';
import { colors } from '@/theme';

import { Button } from './Button';
import { Row } from './Row';
import { Text } from './Text';

type Props = {
  save: SaveData;
  heroId: string;
  slot: EquipmentSlot;
  onPick: (id: string | null) => void;
  onClose: () => void;
};

type Option = { id: string; emoji: string; icon?: ImageSourcePropType; title: string; subtitle?: string };

function optionsFor(save: SaveData, heroId: string, slot: EquipmentSlot): Option[] {
  if (slot === 'consumable') {
    return Object.entries(save.consumables)
      .filter(([, count]) => count > 0)
      .map(([itemId, count]) => ({
        id: itemId,
        emoji: itemById[itemId].emoji,
        icon: itemById[itemId].icon,
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
      icon: item.icon,
      title: gearName(gear),
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
                <Row emoji={option.emoji} icon={option.icon} title={option.title} subtitle={option.subtitle} />
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
  sheet: {
    backgroundColor: colors.parchment,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '70%',
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '600' },
  empty: { color: '#666', paddingVertical: 8 },
});
