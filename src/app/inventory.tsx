import { ScrollView, StyleSheet, Text } from 'react-native';

import { Row, SectionTitle } from '@/components/Row';
import { StepChests } from '@/components/StepChests';
import { itemById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { useGameStore } from '@/store/gameStore';

export default function InventoryScreen() {
  const save = useGameStore((state) => state.save);
  const ownedMaterials = materials.filter((m) => (save.materials[m.id] ?? 0) > 0);
  const ownedConsumables = Object.entries(save.consumables).filter(([, count]) => count > 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Row emoji="🪙" title="Gold" right={save.gold} />

      <StepChests />

      <SectionTitle>Materials</SectionTitle>
      {ownedMaterials.length === 0 && <Text style={styles.empty}>Walk around to gather materials.</Text>}
      {ownedMaterials.map((m) => (
        <Row key={m.id} emoji={m.emoji} title={m.name} right={save.materials[m.id]} />
      ))}

      <SectionTitle>Gear</SectionTitle>
      {save.gear.length === 0 && <Text style={styles.empty}>Forge weapons and armor at the forge.</Text>}
      {save.gear.map((gear) => {
        const item = itemById[gear.itemId];
        return (
          <Row
            key={gear.uid}
            emoji={item.emoji}
            title={item.name}
            subtitle={item.slot !== 'consumable' ? `Durability ${gear.durability}/${item.maxDurability}` : undefined}
          />
        );
      })}

      <SectionTitle>Consumables</SectionTitle>
      {ownedConsumables.length === 0 && <Text style={styles.empty}>Brew potions and rations with alchemy.</Text>}
      {ownedConsumables.map(([itemId, count]) => (
        <Row key={itemId} emoji={itemById[itemId].emoji} title={itemById[itemId].name} right={count} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  empty: { color: '#666', paddingVertical: 8 },
});
