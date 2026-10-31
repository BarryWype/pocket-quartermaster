import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { masteryTypeNames, qualities } from '@/content/forging';
import { heroClasses } from '@/content/heroes';
import { gearProfiles } from '@/content/equipment';
import { componentById, gearName, itemById, materialById, recipeById, recipeOutput, relicById, valuableById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { canCraft, craftableCount, forgedItem, isKnown, ownsTool, type ForgeResult } from '@/game/crafting/crafting';
import { forgeList } from '@/game/crafting/forgeList';
import { tierRecipes } from '@/game/crafting/recipeUnlocks';
import { ELEMENTS, shardId } from '@/game/elements';
import { canForgeWithComponent, componentRecipe, fittingComponents } from '@/game/forging/components';
import { affinityOf } from '@/game/team/team';
import { masteryOf, masteryTypeOf } from '@/game/forging/mastery';
import { canRestore, relicRecipe } from '@/game/forging/relics';
import { guildBonus } from '@/game/guild/guild';
import { rollToScale } from '@/game/forging/roll';
import type { SaveData } from '@/game/save';
import type { GearDef, RecipeDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { statIcons, STATS } from './GearRow';
import { GameIcon } from './GameIcon';
import { GearMarks } from './GearMarks';
import { Panel } from './Panel';
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
  const forgeWithComponent = useGameStore((state) => state.forgeWithComponent);
  const restoreRelic = useGameStore((state) => state.restoreRelic);
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
      {grid && <RelicList save={save} onRestore={(uid) => setResult(restoreRelic(uid))} />}
      {grid && (
        <GearGrid
          save={save}
          action={action}
          onCraft={(recipeId) => setResult(craft(recipeId))}
          onForgeWith={(recipeId, componentId) => setResult(forgeWithComponent(recipeId, componentId))}
        />
      )}
    </ScrollView>
  );
}

/** Unrestored relics, each with its effect, its restore cost and a Restore button. */
function RelicList({ save, onRestore }: { save: SaveData; onRestore: (relicUid: string) => void }) {
  if (save.relics.length === 0) return null;
  return (
    <View>
      <Text style={styles.family}>{t('crafting.relics')}</Text>
      {save.relics.map(({ uid, relicId }) => {
        const relic = relicById[relicId];
        return (
          <Row
            key={uid}
            emoji={gearProfiles[relic.gearType].emoji}
            title={tr(relic.name)}
            subtitle={
              <View>
                <View style={styles.relicHead}>
                  <GearMarks tier={relic.tier} />
                  <Text style={styles.mastery}>{tr(masteryTypeNames[relic.gearType].name)}</Text>
                </View>
                <Text style={styles.mastery}>✦ {tr(relic.effect)}</Text>
                <View style={styles.inputs}>
                  <RecipeInputs save={save} recipe={relicRecipe(relic, guildBonus(save, 'relicRestore'))} />
                </View>
              </View>
            }
            right={<Button title={t('crafting.restore')} disabled={!canRestore(save, uid)} onPress={() => onRestore(uid)} />}
          />
        );
      })}
    </View>
  );
}

/** The components the player holds that fit a blueprint, each with its swapped recipe and what it adds. */
function ComponentPicker({ save, recipe, onForge }: { save: SaveData; recipe: RecipeDef; onForge: (componentId: string) => void }) {
  return (
    <View style={styles.picker}>
      <Text style={styles.mastery}>{t('crafting.componentHint', { item: tr(recipeOutput(recipe).name) })}</Text>
      {fittingComponents(save, recipe).map((componentId) => {
        const component = componentById[componentId];
        return (
          <Row
            key={componentId}
            emoji={component.emoji}
            title={tr(component.name)}
            subtitle={
              <View>
                <Text style={styles.mastery}>✦ {tr(component.adds)}</Text>
                <View style={styles.inputs}>
                  <RecipeInputs save={save} recipe={{ ...recipe, inputs: componentRecipe(recipe, componentId) }} />
                </View>
              </View>
            }
            right={
              <Button title={t('crafting.forge')} disabled={!canForgeWithComponent(save, recipe, componentId)} onPress={() => onForge(componentId)} />
            }
          />
        );
      })}
    </View>
  );
}

/** One known blueprint as a full-width card: name and tier, the mastery that sets its quality, its stats, the roster's ▲/▼ affinities, any keywords, the cost held/needed and the craft buttons. */
function GearCard({
  save,
  recipe,
  action,
  picking,
  onTogglePick,
  onCraft,
}: {
  save: SaveData;
  recipe: RecipeDef;
  action: string;
  picking: boolean;
  onTogglePick: () => void;
  onCraft: () => void;
}) {
  const item = forgedItem(recipe);
  if (!item) return null;
  const type = masteryTypeOf(item);
  const { level } = masteryOf(save, type);
  const classIds = [...new Set(save.heroes.map((hero) => hero.classId))];
  const favoured = classIds.filter((classId) => affinityOf(classId, item.gearType) === 'favoured');
  const unfit = classIds.filter((classId) => affinityOf(classId, item.gearType) === 'unfit');
  return (
    <Panel color={colors.parchmentDark}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>
          {item.emoji} {tr(item.name)}
        </Text>
        <GearMarks tier={item.tier} />
      </View>
      <Text style={styles.mastery}>{t('crafting.mastery', { type: tr(masteryTypeNames[type].name), level })}</Text>
      <View style={styles.statGrid}>
        {STATS.filter((key) => item.stats[key]).map((key) => (
          <Text key={key} style={styles.statCell}>
            {statIcons[key]} {Math.round(item.stats[key]!)}
          </Text>
        ))}
      </View>
      {(favoured.length > 0 || unfit.length > 0) && (
        <Text style={styles.mastery}>
          {favoured.length > 0 ? (
            <Text style={styles.favoured}>{t('classes.favoured', { types: favoured.map((classId) => tr(heroClasses[classId].name)).join(', ') })}</Text>
          ) : null}
          {favoured.length > 0 && unfit.length > 0 ? '  ' : ''}
          {unfit.length > 0 ? (
            <Text style={styles.unfit}>{t('classes.unfit', { types: unfit.map((classId) => tr(heroClasses[classId].name)).join(', ') })}</Text>
          ) : null}
        </Text>
      )}
      {item.keywords.length > 0 && (
        <Text style={styles.mastery}>✦ {item.keywords.map((keyword) => t(`threats.keyword.${keyword}`)).join(', ')}</Text>
      )}
      <View style={styles.inputs}>
        <RecipeInputs save={save} recipe={recipe} />
      </View>
      <Button title={action} disabled={!canCraft(save, recipe)} onPress={onCraft} />
      {fittingComponents(save, recipe).length > 0 && (
        <Button title={t('crafting.withComponent')} color={picking ? undefined : colors.muted} onPress={onTogglePick} />
      )}
    </Panel>
  );
}

/** The forge's gear recipes: one section per tier, its known blueprints only — unknown ones stay hidden. A known blueprint with a fitting component held opens a component picker under its section. */
function GearGrid({
  save,
  action,
  onCraft,
  onForgeWith,
}: {
  save: SaveData;
  action: string;
  onCraft: (recipeId: string) => void;
  onForgeWith: (recipeId: string, componentId: string) => void;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const { tiers } = forgeList(save);
  return (
    <View style={styles.grid}>
      {tiers.map(({ tier, recipeIds }) => (
        <View key={tier} style={styles.gridRow}>
          <Text style={styles.mastery}>
            {t('crafting.tierProgress', { tier, known: recipeIds.length, total: tierRecipes(tier).length })}
          </Text>
          {recipeIds.length === 0 ? (
            <Text style={styles.mastery}>{t('crafting.noBlueprints', { tier })}</Text>
          ) : (
            recipeIds.map((id) => (
              <GearCard
                key={id}
                save={save}
                recipe={recipeById[id]}
                action={action}
                picking={picking === id}
                onTogglePick={() => setPicking(picking === id ? null : id)}
                onCraft={() => onCraft(id)}
              />
            ))
          )}
          {picking && recipeIds.includes(picking) && (
            <ComponentPicker
              save={save}
              recipe={recipeById[picking]}
              onForge={(componentId) => {
                onForgeWith(picking, componentId);
                setPicking(null);
              }}
            />
          )}
        </View>
      ))}
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
  gridRow: { gap: 4 },
  gridHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { flex: 1, fontSize: 20, color: colors.ink },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 },
  statCell: { fontSize: 17 },
  favoured: { color: colors.success },
  unfit: { color: colors.danger },
  picker: { gap: 4, padding: 6, borderWidth: pixel.outline, borderColor: colors.ink },
  relicHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
