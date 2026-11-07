import { type ImageSourcePropType } from 'react-native';

import { affixById, type AffixDef, type AffixEffect } from '@/content/affixes';
import { elementInfo } from '@/content/elements';
import { tagInfo } from '@/content/rotation';
import type { Tag } from '@/game/types';
import { formatPercent, getLocale, t, tr, type Vars } from '@/i18n';

/** An affix's name in the current language, e.g. "Hunter" / "Chasseur". */
export function affixName(id: string): string {
  const affix = affixById[id];
  return affix ? (getLocale() === 'fr' ? affix.nameFr : affix.name) : id;
}

/**
 * One rolled value in the catalogue's unit: "22%", "+2" or "3 m"; with `max`
 * set, the whole forgeable range: "15–30%", "+1–3" or "3–8 m".
 */
function valueText(unit: AffixDef['unit'], min: number, max?: number): string {
  if (unit === 'flat') return max === undefined ? `+${min}` : `+${min}–${max}`;
  if (unit === 'm') return max === undefined ? `${min} m` : `${min}–${max} m`;
  return max === undefined ? formatPercent(min / 100) : `${min}–${formatPercent(max / 100)}`;
}

/** The tag names as they read mid-sentence, "beasts and constructs"; families are plural. */
function tagNames(tags: Tag[]): string {
  const names = tags.map((tag) => tr(tagInfo[tag].name).toLowerCase());
  const last = names.pop() ?? '';
  if (names.length === 0) return last;
  const and = getLocale() === 'fr' ? ' et ' : ' and ';
  return `${names.join(', ')}${and}${last}`;
}

/** The names an effect template plays on: its tags, stat or element. */
function effectVars(effect: AffixEffect): Vars {
  switch (effect.kind) {
    case 'damageVs':
    case 'damageFrom':
      return { tags: tagNames(effect.tags) };
    case 'stat':
      return { stat: t(`hero.statNames.${effect.stat}`) };
    case 'infused':
    case 'warding':
      return { element: tr(elementInfo[effect.element].name) };
    default:
      return {};
  }
}

/** The affix's effect text, its value already in its unit. */
function effectText(effect: AffixEffect, value: string): string {
  return t(`affix.effect.${effect.kind}`, { value, ...effectVars(effect) });
}

/** One affix as a piece shows it, e.g. "Hunter: +22% damage to beasts"; fixed ones show no value. */
export function affixLine(affix: { id: string; value: number }): string {
  const def = affixById[affix.id];
  if (!def) return affix.id;
  const value = def.unit ? valueText(def.unit, affix.value) : '';
  return `${affixName(affix.id)}: ${effectText(def.effect, value)}`;
}

/** One affix with its rolled range instead of a value, e.g. "Hunter: +15–30% damage to beasts". */
export function affixRangeLine(id: string, min: number, max: number): string {
  const def = affixById[id];
  if (!def) return id;
  const value = def.unit ? valueText(def.unit, min, max) : '';
  return `${affixName(id)}: ${effectText(def.effect, value)}`;
}

/** The icon an affix's line shows: its family tag's or element's. */
export function affixIcon(id: string): { emoji: string; icon?: ImageSourcePropType } {
  const def = affixById[id];
  if (!def) return { emoji: '◆' };
  if ('element' in def.effect) return { emoji: elementInfo[def.effect.element].emoji };
  if (def.family === 'walking') return { emoji: '🥾' };
  const tag = tagInfo[def.family as Tag];
  return { emoji: tag.emoji, icon: tag.icon };
}
