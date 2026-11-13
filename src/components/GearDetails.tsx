import type { ReactNode } from 'react';
import { Text as NativeText, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { affinityRules } from '@/content/equipment';
import { gearRules, rarityNames } from '@/content/gear';
import { bossById } from '@/content/enemies';
import { dungeonById, earnedNameText, gearName, itemById } from '@/content/lookup';
import type { SaveData } from '@/game/save';
import type { GearDef, GearInstance, GearSource, Rarity, Stats } from '@/game/types';
import { gearFamilyTags } from '@/game/families/families';
import { gearIconOf } from '@/game/gear/gearIcon';
import { affinityOf, equipPreview, heroStats } from '@/game/team/team';
import { formatDate, formatNumber, t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { AffixLines } from './AffixLines';
import { affixIcon, affixLine } from './affixText';
import { FamilyTags } from './FamilyTag';
import { DELTA_KEYS, gearStatsParts } from './GearRow';
import { IconLabel, PartsLine } from './IconLabel';
import { Text } from './Text';
import { workToolParts } from './WorkToolLine';
import { ItemPopup, type PopupLine } from './ui';

/** The gear slots a comparison is made in. */
type CompareSlot = 'helmet' | 'weapon' | 'armor' | 'offhand' | 'trinket';

/** Compare a piece with what this hero wears in the slot. */
export type GearCompare = { save: SaveData; heroId: string; slot: CompareSlot };

type Props = {
  gear: GearInstance;
  /** List rows and pop-ups show smaller lines. */
  compact?: boolean;
  /** Shows each stat as it counts for this hero, with the difference to the worn piece, and the hero's affinity. */
  compare?: GearCompare;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export type StatRow = { key: keyof Stats; value: number; diff: number };

/**
 * What a piece adds to a hero's stats (after the class's affinity) and how
 * much more or less that is than the piece worn in the slot now. Null when the
 * slot refuses the piece.
 */
export function compareStats(save: SaveData, heroId: string, slot: CompareSlot, gear: GearInstance): StatRow[] | null {
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return null;
  const worn = hero.equipment[slot] === gear.uid;
  const preview = worn ? { before: heroStats(save, hero), after: heroStats(save, hero) } : equipPreview(save, heroId, slot, gear.uid);
  if (!preview) return null;
  const bare = heroStats(save, { ...hero, equipment: { ...hero.equipment, [slot]: null } });
  return DELTA_KEYS.map((key) => ({
    key,
    value: Math.round(preview.after[key] - bare[key]),
    diff: Math.round(preview.after[key]) - Math.round(preview.before[key]),
  })).filter((row) => row.value !== 0 || row.diff !== 0);
}

/** The hero's affinity for the piece and what it does to its stats: "Favoured by Lyra · stats ×1.2". */
export function affinityLine(save: SaveData, heroId: string, gear: GearInstance): PopupLine | null {
  const hero = save.heroes.find((h) => h.id === heroId);
  const item = itemById[gear.itemId] as GearDef;
  if (!hero || !item.gearType) return null;
  const affinity = affinityOf(hero.classId, item.gearType);
  const name = t(`partyDialog.affinity.${affinity}`, { name: hero.name });
  if (affinity === 'usable') return { tone: 'muted', text: name };
  return { tone: affinity === 'favoured' ? 'good' : 'bad', text: `${name} · ${t('gear.affinityStats', { value: formatNumber(affinityRules[affinity]) })}` };
}

/** The affixes the worn piece has that this one would take away. */
function lostAffixes(save: SaveData, heroId: string, slot: CompareSlot, gear: GearInstance) {
  const wornUid = save.heroes.find((h) => h.id === heroId)?.equipment[slot];
  if (!wornUid || wornUid === gear.uid) return [];
  const worn = save.gear.find((g) => g.uid === wornUid);
  const kept = new Set(gear.affixes.map((affix) => affix.id));
  return (worn?.affixes ?? []).filter((affix) => !kept.has(affix.id));
}

/** One stat as it counts for the hero, with ▲ or ▼ and the difference to the worn piece. */
function StatLine({ row, labelStyle }: { row: StatRow; labelStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statName, labelStyle]}>{t(`hero.statNames.${row.key}`)}</Text>
      <Text style={[styles.statValue, labelStyle]}>{String(row.value)}</Text>
      <Text style={[styles.statDiff, row.diff > 0 ? styles.up : styles.down]}>
        {row.diff > 0 ? `▲ +${row.diff}` : row.diff < 0 ? `▼ −${-row.diff}` : ''}
      </Text>
    </View>
  );
}

/**
 * What a piece is, the same everywhere it is described: its family tags, its
 * own stats after the roll, its work-tool line, its unique and each of its
 * affixes. Compared with a hero's slot, the stats count as they do for that
 * hero, each with its difference to the worn piece, after the hero's affinity.
 */
export function GearDetails({ gear, compact, compare, style, labelStyle }: Props) {
  const item = itemById[gear.itemId] as GearDef;
  const rows = compare ? compareStats(compare.save, compare.heroId, compare.slot, gear) : null;
  const affinity = compare ? affinityLine(compare.save, compare.heroId, gear) : null;
  const lost = compare ? lostAffixes(compare.save, compare.heroId, compare.slot, gear) : [];
  const stats = rows ? [] : gearStatsParts(gear);
  const tool = workToolParts(item);
  const tags = gearFamilyTags(item, gear.relicId);
  const hasAffixes = gear.relicId !== undefined || gear.unique !== undefined || gear.affixes.length > 0;
  if (stats.length === 0 && !rows?.length && tool.length === 0 && !hasAffixes && tags.length === 0 && !affinity) return null;
  return (
    <View style={[styles.details, style]}>
      <FamilyTags tags={tags} />
      {affinity && (
        <Text style={[styles.affinity, affinity.tone === 'good' ? styles.up : affinity.tone === 'bad' ? styles.down : styles.muted]}>{affinity.text}</Text>
      )}
      {stats.length > 0 && <PartsLine parts={stats} sep="   " labelStyle={labelStyle} />}
      {rows && rows.length > 0 && (
        <View style={styles.stats}>
          {rows.map((row) => (
            <StatLine key={row.key} row={row} labelStyle={labelStyle} />
          ))}
        </View>
      )}
      {tool.length > 0 && <PartsLine parts={tool} labelStyle={labelStyle} />}
      <AffixLines piece={gear} compact={compact} labelStyle={labelStyle} />
      {lost.map((affix, i) => {
        const icon = affixIcon(affix.id);
        return <IconLabel key={i} emoji={icon.emoji} icon={icon.icon} label={`− ${affixLine(affix)}`} size={compact ? 15 : 18} labelStyle={[labelStyle, styles.down]} />;
      })}
    </View>
  );
}

/** "Rare · Iron sword": the rarity in its colour, then the base item. */
export function GearSubtitle({ gear }: { gear: GearInstance }) {
  return (
    <>
      <RarityName rarity={gear.rarity} />
      {` · ${tr(itemById[gear.itemId].name)}`}
    </>
  );
}

/**
 * A rarity's name inside a card's title-band subtitle: a plain nested text, so
 * it keeps the band's light font and size, tinted with the rarity's colour.
 * Common keeps the band's colour: its own dark brown is made for parchment.
 */
export function RarityName({ rarity }: { rarity: Rarity }) {
  return <NativeText style={rarity === 'common' ? undefined : { color: gearRules.colors[rarity] }}>{tr(rarityNames[rarity])}</NativeText>;
}

/** Where a piece came from: forged by you, or found where; nothing when unknown (pieces from before version 50). */
function originLine(gear: GearInstance): string | null {
  if (gear.forged) return t('gear.history.forged');
  if (!gear.foundIn) return null;
  const dungeon = dungeonById[gear.foundIn];
  return dungeon ? t('gear.history.foundIn', { dungeon: tr(dungeon.name) }) : t(`gear.history.source.${gear.foundIn as GearSource}`);
}

/** A piece's history: where it came from, its runs, kills and bosses, and its earned name with the day it was earned. */
export function GearHistoryBlock({ gear }: { gear: GearInstance }) {
  const history = gear.history;
  const origin = originLine(gear);
  const counts = [
    history && history.runs > 0 ? t('gear.history.runs', { count: history.runs }) : null,
    history && history.kills > 0 ? t('gear.history.kills', { count: history.kills }) : null,
  ].filter((part): part is string => part !== null);
  const bosses = (history?.bosses ?? []).map((id) => tr(bossById[id]?.name ?? id));
  const name = gear.earnedName ? earnedNameText(gear.earnedName) : null;
  if (!origin && counts.length === 0 && bosses.length === 0 && !name) return null;
  return (
    <View style={styles.history}>
      <Text style={styles.historyTitle}>{t('gear.history.title')}</Text>
      {origin && <Text style={styles.historyLine}>{origin}</Text>}
      {counts.length > 0 && <Text style={styles.historyLine}>{counts.join(' · ')}</Text>}
      {bosses.length > 0 && <Text style={styles.historyLine}>{t('gear.history.bosses', { list: bosses.join(', ') })}</Text>}
      {name && <Text style={styles.historyLine}>{t('gear.history.named', { date: formatDate(gear.earnedName!.at) })}</Text>}
    </View>
  );
}

/**
 * A piece's card, the same in the inventory, on the hero screen and in the
 * party's pickers: its name, rarity and details, compared with a hero's slot
 * when `compare` is given. `children` come after the details.
 */
export function GearCard({
  gear,
  compare,
  note,
  lines,
  action,
  pointer,
  labelStyle,
  children,
}: {
  gear: GearInstance;
  compare?: GearCompare;
  note?: string;
  lines?: PopupLine[];
  action?: { title: string; onPress: () => void; disabled?: boolean };
  pointer?: { side: 'top' | 'bottom'; x: number };
  labelStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
}) {
  const item = itemById[gear.itemId];
  return (
    <ItemPopup
      pointer={pointer}
      title={gearName(gear)}
      emoji={item.emoji}
      icon={gearIconOf(gear)}
      legendary={gear.rarity === 'legendary' ? true : undefined}
      subtitle={<GearSubtitle gear={gear} />}
      note={note}
      lines={lines}
      action={action}
    >
      <GearDetails gear={gear} compact compare={compare} labelStyle={labelStyle} style={styles.card} />
      <GearHistoryBlock gear={gear} />
      {children}
    </ItemPopup>
  );
}

const styles = StyleSheet.create({
  details: { gap: 4, alignItems: 'flex-start' },
  card: { alignSelf: 'stretch' },
  affinity: { fontFamily: fonts.serif, fontSize: 15 },
  stats: { alignSelf: 'stretch', gap: 2 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  statName: { flex: 1, fontFamily: fonts.serif, fontSize: 15, color: ui.ink },
  statValue: { minWidth: 32, textAlign: 'right', fontFamily: fonts.serifBold, fontSize: 15, color: ui.ink },
  statDiff: { minWidth: 52, fontFamily: fonts.serif, fontSize: 15 },
  up: { color: ui.good },
  down: { color: ui.bad },
  muted: { color: ui.inkMuted },
  history: { alignSelf: 'stretch', gap: 1, borderTopWidth: 2, borderTopColor: ui.parchmentRule, borderStyle: 'dashed', paddingTop: 4 },
  historyTitle: { fontSize: 16, color: ui.ink },
  historyLine: { fontFamily: fonts.serif, fontSize: 14, color: ui.inkMuted },
});
