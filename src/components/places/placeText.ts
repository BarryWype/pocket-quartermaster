import type { ImageSourcePropType } from 'react-native';

import { gearRules } from '@/content/gear';
import { gearName, itemById, materialById, recipeById, recipeOutput } from '@/content/lookup';
import { placeInfo, type PlaceKind, type SecretKind } from '@/content/places';
import { systemIcons } from '@/content/systemIcons';
import { gearIconOf } from '@/game/gear/gearIcon';
import type { StockLine } from '@/game/places/shops';
import { t, tr } from '@/i18n';

/** Kinds the place sheets know how to open; other kinds stay off the map until their rules exist. */
export const PANEL_KINDS: PlaceKind[] = [
  'smithy',
  'apothecary',
  'chapel',
  'market',
  'library',
  'ruins',
  'thievesGuild',
  'fishingDock',
];

const HOUR = 3_600_000;

export function leavesIn(ms: number) {
  const time = ms >= HOUR ? t('places.hours', { count: Math.floor(ms / HOUR) }) : t('places.minutes', { count: Math.max(1, Math.ceil(ms / 60_000)) });
  return t('places.leavesIn', { time });
}

/** How a stock line looks as a tile and on its card: its icon, its name, and a rarity frame for rare gear. */
export function stockLook(line: StockLine): { emoji: string; icon?: ImageSourcePropType; name: string; frame?: string } {
  if (line.kind === 'material') {
    const material = materialById[line.id];
    return { emoji: material.emoji, icon: material.icon ?? systemIcons[material.emoji], name: tr(material.name) };
  }
  if (line.kind === 'item') {
    const item = itemById[line.id];
    return { emoji: item.emoji, icon: item.icon ?? systemIcons[item.emoji], name: tr(item.name) };
  }
  if (line.kind === 'gear') {
    const gear = line.gear!;
    const frame = gear.rarity === 'common' ? undefined : gearRules.colors[gear.rarity];
    return { emoji: itemById[line.id].emoji, icon: gearIconOf(gear), name: gearName(gear), frame };
  }
  if (line.kind === 'tip') {
    const info = placeInfo[line.id as SecretKind];
    return { emoji: info.emoji, name: t('places.tip', { name: tr(info.name) }) };
  }
  const output = recipeOutput(recipeById[line.id]);
  return { emoji: output.emoji, icon: output.icon ?? systemIcons[output.emoji], name: t('places.recipe', { name: tr(output.name) }), frame: undefined };
}

/** Lines sold by the unit, where a quantity makes sense: materials and consumables. Gear, blueprints and tips are one-offs. */
export const isStack = (line: StockLine) => line.kind === 'material' || line.kind === 'item';
