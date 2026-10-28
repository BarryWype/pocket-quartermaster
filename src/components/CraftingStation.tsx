import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { masteryTypeNames, QUALITIES, qualities, TIER_NAMES } from '@/content/forging';
import { gearName, itemById, materialById, recipeOutput } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { canCraft, craftableCount, forgedItem, isKnown, ownsTool, type ForgeResult } from '@/game/crafting/crafting';
import { forgesForNextLevel, masteryCap, masteryOf, masteryTypeOf } from '@/game/forging/mastery';
import { qualityOdds } from '@/game/forging/quality';
import { rollToScale } from '@/game/forging/roll';
import type { SaveData } from '@/game/save';
import type { GearDef, RecipeDef } from '@/game/types';
import { formatPercent, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

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

type Tab = NonNullable<RecipeDef['tab']>;
const TABS: Tab[] = ['kitchen', 'alchemy'];
/** Batch sizes for Provisions recipes. */
const BATCHES = [1, 5, 10];

/** Mastery level and progress for the item's type, and the quality odds of forging it now. */
function MasteryLine({ save, item }: { save: SaveData; item: GearDef }) {
  const type = masteryTypeOf(item);
  const { level, progress } = masteryOf(save, type);
  const odds = qualityOdds(level, item.tier);
  const needed = forgesForNextLevel(level);
  const maxed = level >= masteryCap(item.tier);
  const next = TIER_NAMES[item.tier];
  return (
    <View>
      <Text style={styles.mastery}>
        {t('crafting.mastery', { type: tr(masteryTypeNames[type].name), level })}
        {maxed
          ? `${t('crafting.maxed', { tier: tr(TIER_NAMES[item.tier - 1]) })}${
              next ? t('crafting.keepImproving', { tier: tr(next).toLowerCase(), weapons: tr(masteryTypeNames[type].plural) }) : ''
            }`
          : needed
            ? t('crafting.toLevel', { progress, needed, level: level + 1 })
            : ''}
      </Text>
      <Text style={styles.mastery}>
        {QUALITIES.filter((q) => odds[q] > 0).map((q, i) => (
          <Text key={q} style={{ color: qualities[q].color }}>
            {i > 0 ? ' · ' : ''}
            {tr(qualities[q].name)} {formatPercent(odds[q] / 100)}
          </Text>
        ))}
      </Text>
    </View>
  );
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
      <Text style={[styles.bannerTitle, legendary && styles.legendaryTitle, { color: qualities[quality].color }]}>
        {legendary ? '🌟 ' : quality === 'rare' ? '✨ ' : ''}
        {gearName(result.gear)}
      </Text>
      <Text>
        {t('crafting.quality', { quality: tr(qualities[quality].name) })}
        {roll !== undefined ? ` · ${t('gear.roll', { roll: rollToScale(roll), max: 7 })}` : ''}
        {result.levelUp ? t('crafting.levelUp', { type: tr(masteryTypeNames[result.type].name), level: result.mastery.level }) : ''}
      </Text>
    </Pressable>
  );
}

/** The known recipes of one crafting station; locked ones stay hidden. Provisions come in two tabs and batches. */
export function CraftingStation({ station, action }: Props) {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);
  const [result, setResult] = useState<ForgeResult | null>(null);
  const [tab, setTab] = useState<Tab>('kitchen');
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
      {recipes
        .filter((recipe) => recipe.station === station && isKnown(save, recipe) && (!tabbed || recipe.tab === tab))
        .map((recipe) => {
          const output = recipeOutput(recipe);
          const item = forgedItem(recipe);
          const description = 'itemId' in recipe.output ? itemById[recipe.output.itemId].description : undefined;
          const inputs = (
            <View>
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
              {item && <MasteryLine save={save} item={item} />}
              {description ? <Text style={styles.mastery}>{tr(description)}</Text> : null}
              {tabbed && <Text style={styles.mastery}>{t('equip.inStock', { count: save.consumables[output.id] ?? 0 })}</Text>}
            </View>
          );
          return (
            <Row
              key={recipe.id}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  batches: { gap: 4 },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  inputText: { fontSize: 17, color: colors.muted },
  short: { color: colors.danger },
  mastery: { fontSize: 16, color: colors.muted },
  banner: {
    gap: 2,
    padding: 12,
    marginBottom: 8,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  legendary: { borderWidth: 4, padding: 16, backgroundColor: colors.highlight },
  bannerTitle: { fontSize: 22 },
  legendaryTitle: { fontSize: 26 },
});
