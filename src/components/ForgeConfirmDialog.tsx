import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { gearProfiles } from '@/content/equipment';
import { masteryTypeNames, qualities } from '@/content/forging';
import { heroClasses } from '@/content/heroes';
import { componentById, itemById, materialById, recipeById, relicById, valuableById } from '@/content/lookup';
import { threatDefs } from '@/content/threats';
import { canCraft } from '@/game/crafting/crafting';
import { forgeConfirmation, restoreConfirmation, type ConfirmCost } from '@/game/crafting/confirm';
import { canForgeWithComponent, fittingComponents } from '@/game/forging/components';
import { forgeStatRange } from '@/game/forging/quality';
import { canRestore } from '@/game/forging/relics';
import type { SaveData } from '@/game/save';
import type { GearDef } from '@/game/types';
import { affinityOf } from '@/game/team/team';
import { t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { GameIcon } from './GameIcon';
import { useSheetMaxHeight } from './Sheet';
import { STATS } from './GearRow';
import { Text } from './Text';
import { AnchoredPopup, ItemPopup, type PopupAnchor, type PopupIngredient, type PopupLine } from './ui';

/** The forge's roman tier numerals, shared with the tier headers on the forge itself. */
export const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** What the forge asks before it happens: a forge (plain or with a component) or a relic restore. */
export type ForgePending =
  | { kind: 'forge'; recipeId: string; componentId: string | null }
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

/** One fitting component as a tappable row: its icon, name and what it adds. */
function ComponentRow({
  componentId,
  selected,
  onPick,
}: {
  componentId: string;
  selected: boolean;
  onPick: (componentId: string | null) => void;
}) {
  const component = componentById[componentId];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr(component.name)}
      onPress={() => onPick(selected ? null : componentId)}
      style={[styles.componentRow, selected && styles.componentSelected]}
    >
      <GameIcon emoji={component.emoji} size={20} />
      <View style={styles.componentText}>
        <Text style={styles.componentName}>{tr(component.name)}</Text>
        <Text style={styles.componentAdds}>{tr(component.adds)}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Asks before anything is forged or restored: the piece as a pop-up card with
 * its stats, keywords, the roster's affinities and the full cost. The backdrop
 * tap and the back button cancel and change nothing. With an anchor the card
 * opens beside the tapped slot, with its pointer at it.
 */
export function ForgeConfirmDialog({
  save,
  pending,
  onConfirm,
  onClose,
  anchor,
  onPickComponent,
}: {
  save: SaveData;
  pending: ForgePending;
  onConfirm: () => void;
  onClose: () => void;
  anchor?: PopupAnchor | null;
  onPickComponent?: (componentId: string | null) => void;
}) {
  const confirm =
    pending.kind === 'forge' ? forgeConfirmation(save, pending.recipeId, pending.componentId) : restoreConfirmation(save, pending.relicUid);
  const [picking, setPicking] = useState(false);
  const maxHeight = useSheetMaxHeight();
  if (!confirm) return null;
  const isRestore = confirm.kind === 'restore';

  let title: string;
  let emoji: string;
  let icon: ImageSourcePropType | undefined;
  let subtitle: string;
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
    subtitle = `${tr(masteryTypeNames[confirm.gearType].name)} · ${t('crafting.tierShort', { tier: ROMAN[confirm.tier - 1] })}`;
    lines = [{ tone: 'keyword', text: tr(relic.effect) }];
    action = { title: t('crafting.restore'), disabled: !canRestore(save, pending.relicUid), onPress: onConfirm };
  } else {
    if (pending.kind !== 'forge' || confirm.kind !== 'forge') return null;
    const item = itemById[confirm.itemId] as GearDef;
    const recipe = recipeById[confirm.recipeId];
    const componentId = pending.componentId;
    title = tr(item.name);
    emoji = item.emoji;
    icon = item.icon;
    subtitle = `${tr(qualities[confirm.expectedQuality].name)} · ${tr(masteryTypeNames[confirm.gearType].name)} · ${t('crafting.tierShort', { tier: ROMAN[confirm.tier - 1] })}`;

    const mainKey = item.damageStat ?? STATS.find((key) => item.stats[key]) ?? STATS[0];
    // The values the forge can roll: Crappy floor to Uncommon ceiling, Rare and Legendary kept
    // as a surprise. A component forge is guaranteed at least Rare, so it shows the Rare band.
    const range = forgeStatRange(item.stats[mainKey] ?? 0, componentId ? 'rare' : 'crappy', componentId ? 'rare' : 'uncommon');
    value = range.min === range.max ? String(range.min) : `${range.min}–${range.max}`;
    valueLabel = t(`hero.statNames.${mainKey}`);
    const noteParts = STATS.filter((key) => key !== mainKey && item.stats[key]).map((key) => `${t(`hero.statNames.${key}`)} ${signed(item.stats[key]!)}`);
    if (item.twoHanded) noteParts.push(t('hero.twoHanded'));
    noteParts.push(t('crafting.mastery', { type: tr(masteryTypeNames[confirm.gearType].name), level: confirm.masteryLevel }));
    note = noteParts.join(' · ');

    for (const keyword of item.keywords) {
      const threats = threatDefs
        .filter((def) => def.answer.kind === 'keyword' && def.answer.keyword === keyword)
        .map((def) => tr(def.name))
        .join(', ');
      lines.push({ tone: 'keyword', text: t(`threats.keyword.${keyword}`), detail: threats ? t('crafting.keywordAnswers', { threats }) : undefined });
    }
    const classIds = [...new Set(save.heroes.map((hero) => hero.classId))];
    const favoured = classIds.filter((classId) => affinityOf(classId, item.gearType) === 'favoured');
    const unfit = classIds.filter((classId) => affinityOf(classId, item.gearType) === 'unfit');
    if (favoured.length > 0) lines.push({ tone: 'good', text: favoured.map((classId) => tr(heroClasses[classId].name)).join(', ') });
    if (unfit.length > 0) lines.push({ tone: 'bad', text: unfit.map((classId) => tr(heroClasses[classId].name)).join(', ') });
    if (componentId) lines.push({ tone: 'keyword', text: tr(componentById[componentId].name), detail: tr(componentById[componentId].adds) });

    const fitting = fittingComponents(save, recipe);
    const showComponents = onPickComponent !== undefined && fitting.length > 0;
    secondary = showComponents ? { title: t('crafting.withComponent'), onPress: () => setPicking((open) => !open) } : undefined;
    children =
      showComponents && picking ? (
        <View style={styles.componentList}>
          <Text style={styles.componentHint}>{t('crafting.componentHint', { item: tr(item.name) })}</Text>
          <ScrollView style={{ maxHeight }} contentContainerStyle={styles.componentRows}>
            {fitting.map((id) => (
              <ComponentRow key={id} componentId={id} selected={id === componentId} onPick={onPickComponent} />
            ))}
          </ScrollView>
        </View>
      ) : undefined;

    action = {
      title: t('crafting.forge'),
      emoji: '⚒️',
      icon: FORGE_ICON,
      disabled: !(componentId ? canForgeWithComponent(save, recipe, componentId) : canCraft(save, recipe)),
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
  componentList: { alignSelf: 'stretch', gap: 6 },
  componentHint: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted, textAlign: 'center' },
  componentRows: { gap: 6 },
  componentRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: ui.parchmentShade,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  componentSelected: { borderColor: ui.brass },
  componentText: { flex: 1 },
  componentName: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.ink },
  componentAdds: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
});
