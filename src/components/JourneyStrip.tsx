// The expedition as a journey the player can read at a glance: one node per
// step of the run, a tap opening that step's blows and badges, the outcome at
// the end of the road. The prose stays as the log below it; reports from
// before the strip have no steps, so this renders nothing at all.

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GameIcon } from '@/components/GameIcon';
import { FillBar, PressScale } from '@/components/motion';
import { Text } from '@/components/Text';
import { mobById } from '@/content/enemies';
import { heroClasses } from '@/content/heroes';
import { describeMobs } from '@/game/expeditions/log';
import { stepEffectKeys, type EffectBadgeKey } from '@/game/expeditions/steps';
import type { ExpeditionReport, HeroState, ReportStep } from '@/game/types';
import { formatNumber, t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

type Props = { report: ExpeditionReport; heroes: HeroState[] };

const EFFECT_EMOJI: Record<EffectBadgeKey, string> = {
  firebomb: '💥',
  revive: '⚡',
  smokeBomb: '💨',
  crit: '✨',
  duel: '🤺',
  rage: '😤',
  buff: '🌟',
  protect: '🛡️',
  partyHeal: '💚',
  fightHeal: '🍖',
  secondPotion: '🧪',
  poison: '☠️',
  exposed: '⚠️',
  trapReduce: '🪢',
  calmBeast: '🕊️',
  raise: '💀',
  allies: '👥',
  relic: '📿',
  special: '⭐',
  parley: '🗣️',
  cacheOpen: '🗝️',
  stew: '🍲',
  weakness: '🎯',
  family: '🧬',
  tagBonus: '🏷️',
};

const isBadge = (key: string): key is EffectBadgeKey => (stepEffectKeys as readonly string[]).includes(key);

const quietGlyph = (step: ReportStep) => ((step.effects ?? []).includes('parley') ? '🕊️' : '🗝️');

const glyphOf = (step: ReportStep) =>
  step.kind === 'fight' ? '⚔️' : step.kind === 'boss' ? '👑' : step.kind === 'trap' ? '🪤' : step.kind === 'mishap' ? '💥' : quietGlyph(step);

/** A node's short name: the first foe group of a fight, the step's own name otherwise. */
const labelOf = (step: ReportStep) => {
  switch (step.kind) {
    case 'fight': {
      const group = step.mobs[0];
      return group ? `${group.count > 1 ? `${group.count} ` : ''}${tr(mobById[group.mobId].name)}` : '';
    }
    case 'quiet':
      return t((step.effects ?? []).includes('parley') ? 'expeditions.journey.parley' : 'expeditions.journey.cache');
    default:
      return tr(step.name);
  }
};

const ringOf = (step: ReportStep) =>
  step.kind === 'boss'
    ? step.cleared
      ? ui.gold
      : ui.bad
    : step.kind === 'fight'
      ? step.cleared
        ? ui.good
        : ui.bad
      : step.kind === 'trap'
        ? step.trapTriggered
          ? ui.bad
          : ui.inkMuted
        : step.kind === 'mishap'
          ? ui.ember
          : ui.brassDim;

const stateOf = (step: ReportStep) =>
  step.kind === 'fight' || step.kind === 'boss'
    ? t(`expeditions.journey.state.${step.cleared ? 'won' : 'lost'}`)
    : step.kind === 'trap'
      ? t(`expeditions.journey.state.${step.trapTriggered ? 'sprung' : 'avoided'}`)
      : null;

/** The step's fights under its node, when the node is the one open. */
function StepDetail({ step, heroes }: { step: ReportStep; heroes: HeroState[] }) {
  const badges = (step.effects ?? []).filter(isBadge);
  const rows = heroes
    .map((hero) => ({ hero, dealt: Math.round(step.dealt?.[hero.id] ?? 0), taken: Math.round(step.taken?.[hero.id] ?? 0) }))
    .filter((row) => row.dealt > 0 || row.taken > 0);
  const maxDealt = Math.max(1, ...rows.map((row) => row.dealt));
  const maxTaken = Math.max(1, ...rows.map((row) => row.taken));
  const knocked = (step.knockedOut ?? []).map((id) => heroes.find((h) => h.id === id)?.name ?? id);
  const state = stateOf(step);
  const title = step.kind === 'fight' && step.mobs.length > 0 ? describeMobs(step.mobs) : labelOf(step);

  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <Text style={styles.detailTitle} numberOfLines={2}>
          {title}
        </Text>
        {state && <Text style={styles.state}>{state}</Text>}
      </View>
      {badges.length > 0 && (
        <View style={styles.badges}>
          {badges.map((key) => (
            <View key={key} style={styles.badge}>
              <GameIcon emoji={EFFECT_EMOJI[key]} size={14} />
              <Text style={styles.badgeText}>{t(`expeditions.journey.effects.${key}`)}</Text>
            </View>
          ))}
        </View>
      )}
      {rows.length > 0 && (
        <View style={styles.rows}>
          <View style={styles.legend}>
            <Text style={styles.legendDealt}>{t('expeditions.journey.dealt')}</Text>
            <Text style={styles.legendTaken}>{t('expeditions.journey.taken')}</Text>
          </View>
          {rows.map(({ hero, dealt, taken }) => (
            <View key={hero.id} style={styles.row}>
              <GameIcon emoji={heroClasses[hero.classId].emoji} icon={heroClasses[hero.classId].icon} size={18} />
              <Text style={styles.rowName} numberOfLines={1}>
                {hero.name}
              </Text>
              <View style={styles.rowBar}>
                <FillBar value={dealt / maxDealt} color={ui.xp} height={9} segments={1} />
              </View>
              <Text style={styles.rowNumber}>{formatNumber(dealt)}</Text>
              <View style={styles.rowBar}>
                <FillBar value={taken / maxTaken} color={ui.bad} height={9} segments={1} />
              </View>
              <Text style={styles.rowNumber}>{formatNumber(taken)}</Text>
            </View>
          ))}
        </View>
      )}
      {knocked.length > 0 && (
        <View style={styles.badge}>
          <GameIcon emoji="💤" size={14} />
          <Text style={styles.badgeText} numberOfLines={1}>
            {knocked.join(', ')} · {t('expeditions.journey.ko')}
          </Text>
        </View>
      )}
    </View>
  );
}

export function JourneyStrip({ report, heroes }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const steps = report.steps;
  if (!steps || steps.length === 0) return null;
  const success = report.outcome === 'flawless' || report.outcome === 'success';
  const opened = open !== null ? steps[open] : undefined;
  const outcomeEmoji = success ? '🏆' : report.outcome === 'retreat' ? '🏳️' : '💀';

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t('expeditions.journey.heading')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
        {steps.map((step, i) => (
          <View key={i} style={styles.nodeWrap}>
            {i > 0 && <View style={styles.link} />}
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={`${labelOf(step)}${stateOf(step) ? `, ${stateOf(step)}` : ''}`}
              accessibilityState={{ selected: open === i }}
              onPress={() => setOpen(open === i ? null : i)}
              style={styles.node}
            >
              <View style={[styles.disc, { borderColor: open === i ? ui.brass : ringOf(step) }]}>
                <GameIcon emoji={glyphOf(step)} size={18} />
              </View>
              <Text numberOfLines={1} style={styles.nodeLabel}>
                {labelOf(step)}
              </Text>
            </PressScale>
          </View>
        ))}
        <View style={styles.nodeWrap}>
          <View style={styles.link} />
          <View style={styles.node}>
            <View style={[styles.disc, { borderColor: success ? ui.gold : ui.inkMuted }]}>
              <GameIcon emoji={outcomeEmoji} size={18} />
            </View>
            <Text numberOfLines={1} style={styles.nodeLabel}>
              {t(`expeditions.outcome.${report.outcome}`)}
            </Text>
          </View>
        </View>
      </ScrollView>
      {opened && <StepDetail step={opened} heroes={heroes} />}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6, borderTopWidth: 2, borderTopColor: ui.parchmentRule, borderStyle: 'dashed', paddingTop: 6 },
  heading: { fontSize: 19, color: ui.ink },
  track: { alignItems: 'flex-start', paddingVertical: 2 },
  nodeWrap: { flexDirection: 'row', alignItems: 'flex-start' },
  link: { width: 14, height: 2, marginTop: 21, backgroundColor: ui.parchmentRule },
  node: { width: 52, alignItems: 'center', gap: 2 },
  disc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.parchmentShade,
  },
  nodeLabel: { fontSize: 9, color: ui.inkMuted, textAlign: 'center', width: 52 },
  detail: { gap: 5, backgroundColor: ui.parchmentShade, borderWidth: 2, borderColor: ui.brassDim, padding: 7 },
  detailHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  detailTitle: { flex: 1, fontFamily: fonts.serif, fontSize: 13, color: ui.ink },
  state: { fontFamily: fonts.serifBold, fontSize: 12, color: ui.ink },
  legend: { flexDirection: 'row', gap: 12 },
  legendDealt: { fontFamily: fonts.serif, fontSize: 10, color: ui.xp },
  legendTaken: { fontFamily: fonts.serif, fontSize: 10, color: ui.bad },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: ui.parchment,
    borderWidth: 1,
    borderColor: ui.brassDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: fonts.serif, fontSize: 11, color: ui.ink },
  rows: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowName: { width: 64, fontFamily: fonts.serif, fontSize: 12, color: ui.ink },
  rowBar: { flex: 1 },
  rowNumber: { width: 24, fontFamily: fonts.serif, fontSize: 10, color: ui.inkMuted, textAlign: 'right' },
});
