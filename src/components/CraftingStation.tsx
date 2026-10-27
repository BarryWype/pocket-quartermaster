import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { masteryTypeNames, QUALITIES, qualities, TIER_NAMES } from '@/content/forging';
import { gearName, materialById, recipeOutput } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { canCraft, forgeFee, forgedItem, isKnown, ownsTool, type ForgeResult } from '@/game/crafting/crafting';
import { forgesForNextLevel, masteryCap, masteryOf, masteryTypeOf } from '@/game/forging/mastery';
import { qualityOdds } from '@/game/forging/quality';
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
  const { quality } = result.gear;
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
        {result.levelUp ? t('crafting.levelUp', { type: tr(masteryTypeNames[result.type].name), level: result.mastery.level }) : ''}
      </Text>
    </Pressable>
  );
}

/** The known recipes of one crafting station; locked ones stay hidden. */
export function CraftingStation({ station, action }: Props) {
  const save = useGameStore((state) => state.save);
  const craft = useGameStore((state) => state.craft);
  const [result, setResult] = useState<ForgeResult | null>(null);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen={station} />
      {result && <ForgeBanner result={result} onClose={() => setResult(null)} />}
      {recipes
        .filter((recipe) => recipe.station === station && isKnown(save, recipe))
        .map((recipe) => {
          const output = recipeOutput(recipe);
          const item = forgedItem(recipe);
          const fee = forgeFee(save, recipe);
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
                {fee > 0 && <Text style={[styles.inputText, save.gold < fee && styles.short]}>🪙 {save.gold}/{fee}</Text>}
              </View>
              {item && <MasteryLine save={save} item={item} />}
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
