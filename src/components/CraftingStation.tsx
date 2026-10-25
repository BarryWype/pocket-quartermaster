import { ScrollView, StyleSheet, View } from 'react-native';

import { materialById, recipeOutput } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { canCraft, isKnown, ownsTool } from '@/game/crafting/crafting';
import type { RecipeDef } from '@/game/types';
import { useGameStore } from '@/store/gameStore';

import { Button } from './Button';
import { GameIcon } from './GameIcon';
import { Row } from './Row';
import { Text } from './Text';
import { TutorialHint } from './TutorialHint';

type Props = {
  station: RecipeDef['station'];
  /** Label of the craft button, e.g. "Forge" or "Brew". */
  action: string;
};

/** The known recipes of one crafting station; locked ones stay hidden. */
export function CraftingStation({ station, action }: Props) {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen={station} />
      {recipes
        .filter((recipe) => recipe.station === station && isKnown(save, recipe))
        .map((recipe) => {
          const output = recipeOutput(recipe);
          const inputs = (
            <View style={styles.inputs}>
              {recipe.inputs.map(({ materialId, amount }) => {
                const material = materialById[materialId];
                return (
                  <View key={materialId} style={styles.input}>
                    <GameIcon emoji={material.emoji} icon={material.icon} size={18} />
                    <Text style={styles.inputText}>
                      {save.materials[materialId] ?? 0}/{amount}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
          return (
            <Row
              key={recipe.id}
              emoji={output.emoji}
              icon={output.icon}
              title={output.name}
              subtitle={inputs}
              right={
                ownsTool(save, recipe) ? (
                  'Owned'
                ) : (
                  <Button title={action} disabled={!canCraft(save, recipe)} onPress={() => craft(recipe.id)} />
                )
              }
            />
          );
        })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  inputText: { fontSize: 13, color: '#666' },
});
