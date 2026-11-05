import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { affixById } from '@/content/affixes';
import { gearProfiles, gearTypeNames } from '@/content/equipment';
import { gearRules, rarityNames } from '@/content/gear';
import { heroClasses } from '@/content/heroes';
import { componentById, itemById, materialById, monsterPartById, recipeById, relicById, valuableById } from '@/content/lookup';
import { threatDefs } from '@/content/threats';
import { forgeConfirmation, restoreConfirmation, type ConfirmCost } from '@/game/crafting/confirm';
import { canCraft } from '@/game/crafting/crafting';
import { canForgeWithIngredient, fittingIngredients, ingredientAffixId } from '@/game/forging/components';
import { canRestore } from '@/game/forging/relics';
import type { SaveData } from '@/game/save';
import type { GearDef, GearType } from '@/game/types';
import { affinityOf } from '@/game/team/team';
import { t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { affixLine, affixRangeLine } from './affixText';
import { GameIcon } from './GameIcon';
import { useSheetMaxHeight } from './Sheet';
import { Text } from './Text';
import { AnchoredPopup, ItemPopup, type PopupAnchor, type PopupIngredient, type PopupLine } from './ui';

/** The forge's roman tier numerals, shared with the tier headers on the forge itself. */
export const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** What the forge asks before it happens: a forge (plain or with one ingredient) or a relic restore. */
export type ForgePending =
  | { kind: 'forge'; recipeId: string; ingredientId: string | null }
  | { kind: 'restore'; relicUid: string };

/** The tapped slot's place in the window, so the pop-up can open beside it. */
export type { PopupAnchor } from './ui';

const FORGE_ICON: ImageSourcePropType = require('../../assets/icons/scaled/menu-forge.png');

/** A stat value with a minus sign when negative, e.g. "−1" or "5". */
function signed(value: number): string {
  const rounded = Math.round(value);
  return rounded < 0 ? `−${-rounded}` : String(rounded);
}

/** The pop-up's ingredients: every spent material and valuable with what is held and needed. */
function ingredientsOf(cost: ConfirmCost): PopupIngredient[] {
  return [
    ...cost.materials.map(({ id, needed, held }) => ({
      key: id,
      label: tr(materialById[id].name),
      emoji: materialById[id].emoji,
      icon: materialById[id].icon,
      have: held,
      need: needed,
    })),
    ...cost.valuables.map(({ id, needed, held }) => ({
      key: id,
      label: tr(valuableById[id].name),
      emoji: valuableById[id].emoji,
      have: held,
      need: needed,
    })),
  ];
}

/** One fitting ingredient — or plain forging — as a tappable row: its icon, name, held count and the affix it gives. */
function IngredientRow({
  ingredientId,
  gearType,
  held,
  selected,
  onPick,
}: {
  ingredientId: string | null;
  gearType: GearType;
  held: number;
  selected: boolean;
  onPick: (ingredientId: string | null) => void;
}) {
  const picked = () => onPick(selected ? null : ingredientId);
  if (ingredientId === null) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('crafting.noIngredient')}
        onPress={picked}
        style={[styles.ingredientRow, selected && styles.ingredientSelected]}
      >
        <Text style={styles.ingredientName}>{t('crafting.noIngredient')}</Text>
      </Pressable>
    );
  }
  const ingredient = monsterPartById[ingredientId] ?? componentById[ingredientId];
  const affixId = ingredientAffixId(ingredientId, gearType);
  const range = affixId ? affixById[affixId].range : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr(ingredient.name)}
      onPress={picked}
      style={[styles.ingredientRow, selected && styles.ingredientSelected]}
    >
      <GameIcon emoji={ingredient.emoji} size={20} />
      <View style={styles.ingredientText}>
        <Text style={styles.ingredientName}>{tr(ingredient.name)}</Text>
        {affixId && (
          <Text style={styles.ingredientAffix}>
            {range ? affixRangeLine(affixId, range.min, range.max) : affixLine({ id: affixId, value: 0 })}
          </Text>
        )}
      </View>
      <Text style={styles.ingredientHeld}>×{held}</Text>
    </Pressable>
  );
}

/**
 * Asks before anything is forged or restored: the piece as a pop-up card with
 * its stat ranges, the ingredient's affix, keywords, the roster's affinities
 * and the full cost. The backdrop tap and the back button cancel and change
 * nothing. With an anchor the card opens beside the tapped slot, with its
 * pointer at it.
 */
export function ForgeConfirmDialog({
  save,
  pending,
  onConfirm,
  onClose,
  anchor,
  onPickIngredient,
}: {
  save: SaveData;
  pending: ForgePending;
  onConfirm: () => void;
  onClose: () => void;
  anchor?: PopupAnchor | null;
  onPickIngredient?: (ingredientId: string | null) => void;
}) {
  const confirm =
    pending.kind === 'forge' ? forgeConfirmation(save, pending.recipeId, pending.ingredientId) : restoreConfirmation(save, pending.relicUid);
  const [picking, setPicking] = useState(false);
  const maxHeight = useSheetMaxHeight();
  if (!confirm) return null;
  const isRestore = confirm.kind === 'restore';

  let title: string;
  let emoji: string;
  let icon: ImageSourcePropType | undefined;
  let subtitle: ReactNode;
  let value: string | number | undefined;
  let valueLabel: string | undefined;
  let note: string | undefined;
  let lines: PopupLine[] = [];
  let children: ReactNode;
  let secondary: { title: string; onPress: () => void; disabled?: boolean } | undefined;
  let action: { title: string; onPress: () => void; disabled?: boolean; emoji?: string; icon?: ImageSourcePropType };

  if (isRestore) {
    if (pending.kind !== 'restore' || confirm.kind !== 'restore') return null;
    const relic = relicById[confirm.relicId];
    title = tr(relic.name);
    emoji = gearProfiles[relic.gearType].emoji;
    subtitle = `${tr(gearTypeNames[confirm.gearType].name)} · ${t('crafting.tierShort', { tier: ROMAN[confirm.tier - 1] })}`;
    lines = [{ tone: 'keyword', text: tr(relic.effect) }];
    action = { title: t('crafting.restore'), disabled: !canRestore(save, pending.relicUid), onPress: onConfirm };
  } else {
    if (pending.kind !== 'forge' || confirm.kind !== 'forge') return null;
    const item = itemById[confirm.itemId] as GearDef;
    const recipe = recipeById[confirm.recipeId];
    const ingredientId = pending.ingredientId;
    title = tr(item.name);
    emoji = item.emoji;
    icon = item.icon;
    subtitle = (
      <Text>
        <Text style={[{ color: gearRules.colors[confirm.expectedRarity] }]}>{tr(rarityNames[confirm.expectedRarity])}</Text>
        {` · ${tr(gearTypeNames[confirm.gearType].name)} · ${t('crafting.tierShort', { tier: ROMAN[confirm.tier - 1] })}`}
      </Text>
    );

    // One line per stat, with the values the forge can roll at the piece's rarity.
    const rangeOf = ({ min, max }: { min: number; max: number }) => (min === max ? signed(min) : `${signed(min)}–${signed(max)}`);
    const main = confirm.statRanges.find((range) => range.key === item.damageStat) ?? confirm.statRanges[0];
    const others = confirm.statRanges.filter((range) => range !== main);
    value = rangeOf(main);
    valueLabel = t(`hero.statNames.${main.key}`);
    note = others.map((range) => `${t(`hero.statNames.${range.key}`)} ${rangeOf(range)}`).join(' · ') || undefined;

    // The chosen ingredient's affix, at the range the forge rolls it.
    const affixId = ingredientId ? ingredientAffixId(ingredientId, confirm.gearType) : undefined;
    if (affixId) {
      const range = affixById[affixId].range;
      lines.push({
        tone: 'keyword',
        text: range ? affixRangeLine(affixId, range.min, range.max) : affixLine({ id: affixId, value: 0 }),
      });
    }

    for (const keyword of item.keywords) {
      const threats = threatDefs
        .filter((def) => def.answer.kind === 'keyword' && def.answer.keyword === keyword)
        .map((def) => tr(def.name))
        .join(', ');
      lines.push({
        tone: 'keyword',
        text: t(`threats.keyword.${keyword}`),
        detail: threats ? t('crafting.keywordAnswers', { threats }) : undefined,
        tip: t(`threats.keywordTip.${keyword}`),
      });
    }
    const classIds = [...new Set(save.heroes.map((hero) => hero.classId))];
    const favoured = classIds.filter((classId) => affinityOf(classId, item.gearType) === 'favoured');
    const unfit = classIds.filter((classId) => affinityOf(classId, item.gearType) === 'unfit');
    if (favoured.length > 0) lines.push({ tone: 'good', text: favoured.map((classId) => tr(heroClasses[classId].name)).join(', ') });
    if (unfit.length > 0) lines.push({ tone: 'bad', text: unfit.map((classId) => tr(heroClasses[classId].name)).join(', ') });

    const fitting = fittingIngredients(save, recipe);
    const showIngredients = onPickIngredient !== undefined && fitting.length > 0;
    secondary = showIngredients ? { title: t('crafting.pickIngredient'), onPress: () => setPicking((open) => !open) } : undefined;
    children =
      showIngredients && picking ? (
        <View style={styles.ingredientList}>
          <Text style={styles.ingredientHint}>{t('crafting.ingredientHint')}</Text>
          <ScrollView style={{ maxHeight }} contentContainerStyle={styles.ingredientRows}>
            <IngredientRow ingredientId={null} gearType={confirm.gearType} held={0} selected={!ingredientId} onPick={onPickIngredient} />
            {fitting.map((id) => (
              <IngredientRow
                key={id}
                ingredientId={id}
                gearType={confirm.gearType}
                held={save.materials[id] ?? 0}
                selected={id === ingredientId}
                onPick={onPickIngredient}
              />
            ))}
          </ScrollView>
        </View>
      ) : undefined;

    action = {
      title: t('crafting.forge'),
      emoji: '⚒️',
      icon: FORGE_ICON,
      disabled: !(ingredientId ? canForgeWithIngredient(save, recipe, ingredientId) : canCraft(save, recipe)),
      onPress: onConfirm,
    };
  }

  return (
    <AnchoredPopup
      anchor={anchor ?? null}
      onClose={onClose}
      render={(pointer) => (
        <ItemPopup
          pointer={pointer}
          title={title}
          emoji={emoji}
          icon={icon}
          subtitle={subtitle}
          value={value}
          valueLabel={valueLabel}
          note={note}
          lines={lines}
          ingredients={ingredientsOf(confirm.cost)}
          action={action}
          secondary={secondary}
        >
          {children}
        </ItemPopup>
      )}
    />
  );
}

const styles = StyleSheet.create({
  ingredientList: { alignSelf: 'stretch', gap: 6 },
  ingredientHint: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted, textAlign: 'center' },
  ingredientRows: { gap: 6 },
  ingredientRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: ui.parchmentShade,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  ingredientSelected: { borderColor: ui.brass },
  ingredientText: { flex: 1 },
  ingredientName: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.ink },
  ingredientAffix: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  ingredientHeld: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
});
