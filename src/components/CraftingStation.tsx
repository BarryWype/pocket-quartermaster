import { ScrollView, StyleSheet, View } from 'react-native';

import { itemById, materialById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { tiers } from '@/content/tiers';
import { canCraft, isKnown, isOwnedTool } from '@/game/crafting/crafting';
import type { SaveData } from '@/game/save';
import type { RecipeDef } from '@/game/types';
import { useGameStore } from '@/store/gameStore';

import { Button } from './Button';
import { Row, SectionTitle } from './Row';

type Props = {
  station: RecipeDef['station'];
  /** Label of the craft button, e.g. "Forge" or "Brew". */
  action: string;
};

// Recipes without a tier (legendary gear, potions) come last.
const GROUPS = [...tiers.map((tier) => ({ tier: tier.id, title: tier.name })), { tier: undefined, title: 'Special' }];

/** Every recipe of one crafting station, grouped by tier. */
export function CraftingStation({ station, action }: Props) {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);
  const stationRecipes = recipes.filter((recipe) => recipe.station === station);
  const groups = GROUPS.map((group) => ({
    ...group,
    recipes: stationRecipes.filter((recipe) => itemById[recipe.itemId].tier === group.tier),
  })).filter((group) => group.recipes.length > 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {groups.map((group) => (
        <View key={group.title}>
          {groups.length > 1 && <SectionTitle>{group.title}</SectionTitle>}
          {group.recipes.map((recipe) => (
            <RecipeRow key={recipe.id} recipe={recipe} action={action} save={save} onCraft={() => craft(recipe.id)} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

type RecipeRowProps = {
  recipe: RecipeDef;
  action: string;
  save: SaveData;
  onCraft: () => void;
};

function RecipeRow({ recipe, action, save, onCraft }: RecipeRowProps) {
  const item = itemById[recipe.itemId];
  if (!isKnown(save, recipe)) {
    return <Row emoji="🔒" title="Unknown blueprint" subtitle="Found on expeditions" />;
  }
  const inputs = recipe.inputs
    .map(({ materialId, amount }) => {
      const material = materialById[materialId];
      return `${material.emoji} ${save.materials[materialId] ?? 0}/${amount}`;
    })
    .join('  ');
  return (
    <Row
      emoji={item.emoji}
      title={item.name}
      subtitle={inputs}
      right={
        isOwnedTool(save, recipe) ? 'Owned' : <Button title={action} disabled={!canCraft(save, recipe)} onPress={onCraft} />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
