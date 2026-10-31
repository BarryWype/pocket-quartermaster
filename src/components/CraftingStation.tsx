import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { itemById, recipeOutput } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { canCraft, craftableCount, isKnown, ownsTool, type ForgeResult } from '@/game/crafting/crafting';
import type { RecipeDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Button } from './Button';
import { ForgeBanner } from './ForgeBanner';
import { RecipeInputs, recipeInputsStyles } from './RecipeInputs';
import { Row } from './Row';
import { Text } from './Text';
import { TutorialHint } from './TutorialHint';

type Props = {
  station: RecipeDef['station'];
  /** Label of the craft button, e.g. "Brew". */
  action: string;
};

type Tab = NonNullable<RecipeDef['tab']>;
const TABS: Tab[] = ['kitchen', 'alchemy'];
/** Batch sizes for Provisions recipes. */
const BATCHES = [1, 5, 10];

type Family = 'meals' | 'supply' | 'kits' | 'hero' | 'walking' | 'homeCare';
/** Provisions rows are grouped by family, in this order within each tab. */
const FAMILIES: Family[] = ['meals', 'supply', 'kits', 'hero', 'walking', 'homeCare'];

function familyOf(recipe: RecipeDef): Family {
  const item = 'itemId' in recipe.output ? itemById[recipe.output.itemId] : null;
  if (item?.slot === 'provision') return item.meal ? 'meals' : 'supply';
  if (item?.slot === 'utility') return item.walk ? 'walking' : 'homeCare';
  if (item?.slot === 'consumable' && (item.kit || item.protectsAgainst)) return 'kits';
  return 'hero';
}

/** The known recipes of one crafting station; locked ones stay hidden. The forge has its own screen; Provisions comes in two tabs and batches. */
export function CraftingStation({ station, action }: Props) {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);
  const [result, setResult] = useState<ForgeResult | null>(null);
  const [tab, setTab] = useState<Tab>('kitchen');
  /** The recipe picked for an item that has two, by item id. */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const tabbed = station === 'provisions';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen={station} />
      {result && <ForgeBanner result={result} onClose={() => setResult(null)} />}
      {tabbed && (
        <View style={styles.tabs}>
          {TABS.map((key) => (
            <Button key={key} title={t(`crafting.tabs.${key}`)} color={tab === key ? undefined : colors.muted} onPress={() => setTab(key)} />
          ))}
        </View>
      )}
      {FAMILIES.map((family) => {
        const rows = recipes
          .filter((recipe) => recipe.station === station && recipe.tab === tab)
          .filter((recipe) => isKnown(save, recipe))
          .filter((recipe) => familyOf(recipe) === family);
        if (rows.length === 0) return null;
        // An item with a material and a part recipe gets one row showing both.
        const groups = [...new Set(rows.map((recipe) => recipeOutput(recipe).id))].map((id) =>
          rows.filter((recipe) => recipeOutput(recipe).id === id),
        );
        return (
          <View key={family}>
            <Text style={styles.family}>{t(`crafting.families.${family}`)}</Text>
            {groups.map((group) => {
              const output = recipeOutput(group[0]);
              // The recipe the player can afford, or their pick when both are.
              const affordable = group.filter((r) => canCraft(save, r));
              const recipe = affordable.find((r) => r.id === picked[output.id]) ?? affordable[0] ?? group[0];
              const description = 'itemId' in recipe.output ? itemById[recipe.output.itemId].description : undefined;
              const inputs = (
                <View>
                  {group.map((variant) => (
                    <Pressable
                      key={variant.id}
                      disabled={affordable.length < 2 || !affordable.includes(variant)}
                      onPress={() => setPicked({ ...picked, [output.id]: variant.id })}
                      style={[recipeInputsStyles.inputs, group.length > 1 && variant !== recipe && styles.otherRecipe]}
                    >
                      <RecipeInputs save={save} recipe={variant} />
                    </Pressable>
                  ))}
                  {description ? <Text style={styles.mastery}>{tr(description)}</Text> : null}
                  {tabbed && <Text style={styles.mastery}>{t('equip.inStock', { count: save.consumables[output.id] ?? 0 })}</Text>}
                </View>
              );
              return (
                <Row
                  key={output.id}
                  emoji={output.emoji}
                  icon={output.icon}
                  title={tr(output.name)}
                  subtitle={inputs}
                  right={
                    ownsTool(save, recipe) ? (
                      t('crafting.owned')
                    ) : (
                      <View style={styles.batches}>
                        {BATCHES.map((count) => (
                          <Button
                            key={count}
                            title={count === 1 ? (tab === 'kitchen' ? t('crafting.cook') : action) : t('crafting.batch', { count })}
                            disabled={craftableCount(save, recipe) < count}
                            onPress={() => setResult(craft(recipe.id, count))}
                          />
                        ))}
                      </View>
                    )
                  }
                />
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  batches: { gap: 4 },
  otherRecipe: { opacity: 0.45 },
  mastery: { fontSize: 16, color: colors.muted },
  family: { fontSize: 18, color: colors.ink, marginTop: 8, marginBottom: 2 },
});
