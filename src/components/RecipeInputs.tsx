import { StyleSheet, View } from 'react-native';

import { materialById, valuableById } from '@/content/lookup';
import { ELEMENTS, shardId } from '@/game/elements';
import type { SaveData } from '@/game/save';
import type { RecipeDef } from '@/game/types';
import { t } from '@/i18n';
import { colors } from '@/theme';

import { GameIcon } from './GameIcon';
import { Text } from './Text';

/** One recipe's ingredients, held / needed: materials, then gems (any tier) and shards (any one element). */
export function RecipeInputs({ save, recipe }: { save: SaveData; recipe: RecipeDef }) {
  const held = (valuableId: string) =>
    Object.entries(save.valuables).reduce((sum, [key, n]) => (key.startsWith(`${valuableId}:`) ? sum + n : sum), 0);
  const shards = Math.max(...ELEMENTS.map((element) => save.materials[shardId(element)] ?? 0));
  return (
    <>
      {recipe.inputs.map(({ materialId, amount }) => {
        const material = materialById[materialId];
        return (
          <View key={materialId} style={recipeInputsStyles.input}>
            <GameIcon emoji={material.emoji} icon={material.icon} size={18} />
            <Text style={recipeInputsStyles.inputText}>
              {save.materials[materialId] ?? 0}/{amount}
            </Text>
          </View>
        );
      })}
      {(recipe.valuables ?? []).map(({ valuableId, amount }) => (
        <View key={valuableId} style={recipeInputsStyles.input}>
          <GameIcon emoji={valuableById[valuableId].emoji} size={18} />
          <Text style={recipeInputsStyles.inputText}>
            {held(valuableId)}/{amount}
          </Text>
        </View>
      ))}
      {recipe.anyShards ? (
        <View style={recipeInputsStyles.input}>
          <Text style={recipeInputsStyles.inputText}>{t('crafting.anyShards', { held: shards, amount: recipe.anyShards })}</Text>
        </View>
      ) : null}
    </>
  );
}

export const recipeInputsStyles = StyleSheet.create({
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  inputText: { fontSize: 17, color: colors.muted },
});
