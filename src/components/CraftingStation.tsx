import { ScrollView, StyleSheet } from 'react-native';

import { itemById, materialById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { canCraft, isKnown } from '@/game/crafting/crafting';
import type { RecipeDef } from '@/game/types';
import { useGameStore } from '@/store/gameStore';

import { Button } from './Button';
import { Row } from './Row';

type Props = {
  station: RecipeDef['station'];
  /** Label of the craft button, e.g. "Forge" or "Brew". */
  action: string;
};

/** Every recipe of one crafting station. */
export function CraftingStation({ station, action }: Props) {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
