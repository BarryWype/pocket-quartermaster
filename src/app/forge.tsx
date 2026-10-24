import { Button, ScrollView, StyleSheet, View } from 'react-native';

import { Row, SectionTitle } from '@/components/Row';
import { itemById, materialById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { canCraft, isKnown } from '@/game/crafting/crafting';
import type { RecipeDef } from '@/game/types';
import { useGameStore } from '@/store/gameStore';

const STATIONS: { station: RecipeDef['station']; title: string; action: string }[] = [
  { station: 'forge', title: 'Forge', action: 'Forge' },
  { station: 'alchemy', title: 'Alchemy', action: 'Brew' },
];

export default function ForgeScreen() {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {STATIONS.map(({ station, title, action }) => (
        <View key={station}>
          <SectionTitle>{title}</SectionTitle>
          {recipes
            .filter((recipe) => recipe.station === station)
            .map((recipe) => {
              const item = itemById[recipe.itemId];
              if (!isKnown(save, recipe)) {
                return <Row key={recipe.id} emoji="🔒" title="Unknown recipe" subtitle="Found on expeditions" />;
              }
              const inputs = recipe.inputs
                .map(({ materialId, amount }) => {
                  const material = materialById[materialId];
                  return `${material.emoji} ${save.materials[materialId] ?? 0}/${amount}`;
                })
                .join('  ');
              return (
                <Row
                  key={recipe.id}
                  emoji={item.emoji}
                  title={item.name}
                  subtitle={inputs}
                  right={<Button title={action} disabled={!canCraft(save, recipe)} onPress={() => craft(recipe.id)} />}
                />
              );
            })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
