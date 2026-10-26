import { frNames } from '@/content/fr/names';

import { en } from './en';
import { fr } from './fr';
import { article } from './french';
import { getLocale, localized } from './locale';

export { getLocale, localized, setLocale, LOCALES, type Locale } from './locale';

export type Plural = { one: string; other: string };
export type Dictionary = typeof en;
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];
export type TextKey = Leaves<Dictionary>;
export type Vars = Record<string, string | number>;

/**
 * Replaces `{name}` placeholders; unknown ones are left as they are. French
 * texts can ask for an article that agrees with the noun: `{un:trap}`, `{le:boss}`.
 */
export const fill = (template: string, vars: Vars) =>
  template.replace(/\{(?:(\w+):)?(\w+)\}/g, (match, kind: string | undefined, key: string) => {
    if (vars[key] === undefined) return match;
    return kind ? article(kind, String(vars[key])) : String(vars[key]);
  });

/** A content name or description (from `src/content`) in the current language. */
export const tr = (english: string) => (getLocale() === 'fr' ? (frNames[english] ?? english) : english);

/** French counts 0 as singular. */
const isOne = (count: number) => (getLocale() === 'fr' ? Math.abs(count) < 2 : count === 1);

/** A UI text in the current language. Plural texts pick their form from `vars.count`. */
export function t(key: TextKey, vars: Vars = {}): string {
  let value: unknown = localized({ en, fr });
  for (const part of key.split('.')) value = (value as Record<string, unknown>)[part];
  const text = typeof value === 'string' ? value : isOne(Number(vars.count ?? 0)) ? (value as Plural).one : (value as Plural).other;
  return fill(text, vars);
}

const NBSP = ' ';

/** 1,234 in English, 1 234 in French. */
export function formatNumber(value: number) {
  const english = value.toLocaleString('en-US');
  return getLocale() === 'fr' ? english.replace(/,/g, NBSP).replace('.', ',') : english;
}

/** A 0–1 share as a whole percentage: 45% in English, 45 % in French. */
export const formatPercent = (share: number) =>
  `${Math.round(share * 100)}${getLocale() === 'fr' ? `${NBSP}%` : '%'}`;

/** "1h 05m", "3m 05s", "5s" (French: "1 h 05", "3 min 05 s", "5 s"). */
export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (getLocale() === 'fr') {
    if (hours > 0) return `${hours}${NBSP}h${NBSP}${pad(minutes)}`;
    if (minutes > 0) return `${minutes}${NBSP}min${NBSP}${pad(seconds)}${NBSP}s`;
    return `${seconds}${NBSP}s`;
  }
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}
