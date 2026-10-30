import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MASTERY_TYPES, masteryTypeNames, qualities } from '@/content/forging';
import { gearId, gearProfiles } from '@/content/equipment';
import { gearName, itemById, materialById, recipeById, recipeOutput, valuableById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { canCraft, craftableCount, forgedItem, isKnown, ownsTool, type ForgeResult } from '@/game/crafting/crafting';
import { tierRecipes } from '@/game/crafting/recipeUnlocks';
import { ELEMENTS, shardId } from '@/game/elements';
import { masteryOf } from '@/game/forging/mastery';
import { rollToScale } from '@/game/forging/roll';
import type { SaveData } from '@/game/save';
import type { GearDef, RecipeDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { GameIcon } from './GameIcon';
import { GearMarks } from './GearMarks';
import { Row } from './Row';
import { Text } from './Text';
import { TutorialHint } from './TutorialHint';

type Props = {
  station: RecipeDef['station'];
  /** Label of the craft button, e.g. "Forge" or "Brew". */
  action: string;
};

type Tab = NonNullable<RecipeDef['tab']>;
const TABS: Tab[] = ['kitchen', 'alchemy'];
/** Batch sizes for Provisions recipes. */
const BATCHES = [1, 5, 10];
const TIERS = [1, 2, 3, 4, 5];

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

/** The forged piece in its quality colour, bigger for Legendary, and any mastery level-up. */

/** The forged piece in its quality colour, bigger for Legendary, and any mastery level-up. */
function ForgeBanner({ result, onClose }: { result: ForgeResult; onClose: () => void }) {
  const { quality, roll } = result.gear;
  const legendary = quality === 'legendary';
  return (
    <Pressable
      onPress={onClose}
      style={[styles.banner, (quality === 'rare' || legendary) && { borderColor: qualities[quality].color }, legendary && styles.legendary]}
    >
      <View style={styles.bannerTitleRow}>
        <Text style={[styles.bannerTitle, legendary && styles.legendaryTitle, { color: qualities[quality].color }]}>
          {legendary ? '🌟 ' : quality === 'rare' ? '✨ ' : ''}
          {gearName(result.gear)}
        </Text>
        <GearMarks tier={(itemById[result.gear.itemId] as GearDef).tier} />
      </View>
      <Text>
        {t('crafting.quality', { quality: tr(qualities[quality].name) })}
        {roll !== undefined ? ` · ${t('gear.roll', { roll: rollToScale(roll), max: 7 })}` : ''}
        {result.levelUp ? t('crafting.levelUp', { type: tr(masteryTypeNames[result.type].name), level: result.mastery.level }) : ''}
      </Text>
    </Pressable>
  );
}

/** One recipe's ingredients, held / needed: materials, then gems (any tier) and shards (any one element). */
function RecipeInputs({ save, recipe }: { save: SaveData; recipe: RecipeDef }) {
  const held = (valuableId: string) =>
    Object.entries(save.valuables).reduce((sum, [key, n]) => (key.startsWith(`${valuableId}:`) ? sum + n : sum), 0);
  const shards = Math.max(...ELEMENTS.map((element) => save.materials[shardId(element)] ?? 0));
  return (
    <>
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
      {(recipe.valuables ?? []).map(({ valuableId, amount }) => (
        <View key={valuableId} style={styles.input}>
          <GameIcon emoji={valuableById[valuableId].emoji} size={18} />
          <Text style={styles.inputText}>
            {held(valuableId)}/{amount}
          </Text>
        </View>
      ))}
      {recipe.anyShards ? (
        <View style={styles.input}>
          <Text style={styles.inputText}>{t('crafting.anyShards', { held: shards, amount: recipe.anyShards })}</Text>
        </View>
      ) : null}
    </>
  );
}

/** The known recipes of one crafting station; locked ones stay hidden. The forge shows its gear recipes as a grid below. Provisions come in two tabs and batches. */
export function CraftingStation({ station, action }: Props) {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);
  const [result, setResult] = useState<ForgeResult | null>(null);
  const [tab, setTab] = useState<Tab>('kitchen');
  /** The recipe picked for an item that has two, by item id. */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const tabbed = station === 'provisions';
  const grid = station === 'forge';

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
      {(tabbed ? FAMILIES : [null]).map((family) => {
        const rows = recipes
          .filter((recipe) => recipe.station === station && (!tabbed || recipe.tab === tab))
          // At the forge, gear recipes move into the tier grid below.
          .filter((recipe) => !grid || !forgedItem(recipe))
          .filter((recipe) => isKnown(save, recipe))
          .filter((recipe) => family === null || familyOf(recipe) === family);
        if (rows.length === 0) return null;
        // An item with a material and a part recipe gets one row showing both.
        const groups = [...new Set(rows.map((recipe) => recipeOutput(recipe).id))].map((id) =>
          rows.filter((recipe) => recipeOutput(recipe).id === id),
        );
        return (
          <View key={family ?? 'all'}>
            {family && <Text style={styles.family}>{t(`crafting.families.${family}`)}</Text>}
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
                  style={[styles.inputs, group.length > 1 && variant !== recipe && styles.otherRecipe]}
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
                ) : tabbed ? (
                  <View style={styles.batches}>
                    {BATCHES.map((count) => (
                      <Button
                        key={count}
                        title={count === 1 ? (tab === 'kitchen' ? t('crafting.cook') : action) : t('crafting.batch', { count })}
                        disabled={craftableCount(save, recipe) < count}
                        onPress={() => craft(recipe.id, count)}
                      />
                    ))}
                  </View>
                ) : (
                  <Button
                    title={action}
                    disabled={!canCraft(save, recipe)}
                    onPress={() => setResult(craft(recipe.id))}
                  />
                )
              }
            />
          );
            })}
          </View>
        );
      })}
      {grid && <GearGrid save={save} action={action} onCraft={(recipeId) => setResult(craft(recipeId))} />}
    </ScrollView>
  );
}

/** The forge's gear recipes: one row per type, its five tiers side by side, unknown ones greyed with their inputs. */
function GearGrid({ save, action, onCraft }: { save: SaveData; action: string; onCraft: (recipeId: string) => void }) {
  return (
    <View style={styles.grid}>
      <View style={styles.progress}>
        {TIERS.map((tier) => {
          const ids = tierRecipes(tier);
          const known = ids.filter((id) => save.knownRecipes.includes(id)).length;
          return (
            <Text key={tier} style={styles.mastery}>
              {t('crafting.tierProgress', { tier, known, total: ids.length })}
            </Text>
          );
        })}
      </View>
      {MASTERY_TYPES.map((type) => {
        const { level } = masteryOf(save, type);
        return (
          <View key={type} style={styles.gridRow}>
            <View style={styles.gridHead}>
              <Text>{gearProfiles[type].emoji}</Text>
              <Text style={styles.gridHeadText}>
                {tr(masteryTypeNames[type].plural)} · {t('crafting.mastery', { type: tr(masteryTypeNames[type].name), level })}
              </Text>
            </View>
            <View style={styles.gridCells}>
              {TIERS.map((tier) => {
                const recipe = recipeById[gearId(type, tier)];
                const known = isKnown(save, recipe);
                return (
                  <View key={tier} style={[styles.cell, !known && styles.cellUnknown]}>
                    <GearMarks tier={tier} />
                    <View style={styles.cellInputs}>
                      {recipe.inputs.map(({ materialId, amount }) => {
                        const material = materialById[materialId];
                        return (
                          <View key={materialId} style={styles.input}>
                            <GameIcon emoji={material.emoji} icon={material.icon} size={14} />
                            <Text style={styles.cellInputText}>
                              {save.materials[materialId] ?? 0}/{amount}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    {known ? (
                      <Button title={action} disabled={!canCraft(save, recipe)} onPress={() => onCraft(recipe.id)} />
                    ) : (
                      <Text style={styles.cellInputText}>{t('crafting.unknown')}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  batches: { gap: 4 },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  otherRecipe: { opacity: 0.45 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  inputText: { fontSize: 17, color: colors.muted },
  mastery: { fontSize: 16, color: colors.muted },
  family: { fontSize: 18, color: colors.ink, marginTop: 8, marginBottom: 2 },
  grid: { gap: 10, marginTop: 12 },
  progress: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  gridRow: { gap: 4 },
  gridHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gridHeadText: { fontSize: 16, color: colors.ink },
  gridCells: { flexDirection: 'row', gap: 4 },
  cell: {
    flex: 1,
    gap: 4,
    padding: 4,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  cellUnknown: { opacity: 0.55 },
  cellInputs: { gap: 2 },
  cellInputText: { fontSize: 12, color: colors.muted },
  banner: {
    gap: 2,
    padding: 12,
    marginBottom: 8,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  legendary: { borderWidth: 4, padding: 16, backgroundColor: colors.highlight },
  bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerTitle: { fontSize: 22 },
  legendaryTitle: { fontSize: 26 },
});
