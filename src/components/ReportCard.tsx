import { Pressable, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { dungeonById, itemById, materialById, opportunityById, threatById } from '@/content/lookup';
import type { ExpeditionReport, HeroState, OpportunityOutcome } from '@/game/types';
import { formatDuration, t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { lootItems } from './LootReveal';
import { GainsLine } from './IconLabel';
import { GameIcon } from './GameIcon';
import { PixelBar } from './PixelBar';
import { Chip, ParchmentCard } from './ui';
import { Text } from './Text';

type Props = {
  report: ExpeditionReport;
  heroes: HeroState[];
  now: number;
  expanded: boolean;
  onToggle: () => void;
};

/** What an answered opportunity handed over, one short label per effect. */
function opportunityGave(outcome: OpportunityOutcome): string {
  return [
    outcome.gold ? `🪙 +${outcome.gold}` : null,
    ...(outcome.materials ?? []).map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
    outcome.goldMultiplier ? `🪙 ×${outcome.goldMultiplier}` : null,
    outcome.damageMultiplier ? `⚔️ ×${outcome.damageMultiplier}` : null,
    outcome.xpMultiplier ? `✨ ×${outcome.xpMultiplier}` : null,
    outcome.recipe ? t('expeditions.report.recipe') : null,
    outcome.recruit ? t('expeditions.report.recruit') : null,
    outcome.pilgrim ? t(`expeditions.report.pilgrim.${outcome.pilgrim}`) : null,
  ]
    .filter((item): item is string => item !== null)
    .join(' · ');
}

/** A finished expedition: outcome and loot at a glance; tapped, the full log and how the heroes came back. */
export function ReportCard({ report, heroes, now, expanded, onToggle }: Props) {
  const dungeon = dungeonById[report.dungeonId];
  const win = report.outcome === 'flawless' || report.outcome === 'success';
  const outcomeText = `${t(`expeditions.outcome.${report.outcome}`)} (${report.encountersCleared}/${report.encounterCount})`;
  const when = t('expeditions.ago', { time: formatDuration(now - report.finishedAt) });
  const label = `${tr(dungeon.name)}, ${t(`expeditions.outcome.${report.outcome}`)}, ${when}`;

  // Older reports travel light: a wood row that opens into the parchment report.
  if (!expanded) {
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: false }} accessibilityLabel={label} onPress={onToggle} style={styles.row}>
        <View style={styles.rowInner} pointerEvents="none" />
        <Text style={styles.rowName} numberOfLines={1}>
          {tr(dungeon.name)}
          {report.seen ? '' : t('expeditions.new')}
        </Text>
        <Chip tone={win ? 'good' : 'bad'} label={t(`expeditions.outcome.${report.outcome}`)} />
        <Text style={styles.rowWhen}>{when}</Text>
        <Text style={styles.chevron}>▸</Text>
      </Pressable>
    );
  }

  const extras = [
    report.hunger && report.hunger !== 'fed' ? t(`expeditions.hunger.${report.hunger}`) : null,
    report.mealId ? `${itemById[report.mealId].emoji} ${tr(itemById[report.mealId].name)}` : null,
  ].filter((item): item is string => item !== null);
  const loot = [...lootItems(report), `+${report.xp} XP`];

  return (
    <ParchmentCard title={tr(dungeon.name)} titleEmoji={dungeon.emoji} titleSub={`${outcomeText} · ${when}`} contentStyle={styles.content}>
      <Chip tone={win ? 'good' : 'bad'} label={t(`expeditions.outcome.${report.outcome}`)} />
      <GainsLine gains={loot} size={16} gap={6} labelStyle={styles.line} />
      <GainsLine gains={extras} size={16} gap={6} labelStyle={styles.line} />

      <View style={styles.log}>
        {(report.threats ?? []).map((threat, i) => {
          const def = threatById[threat.id];
          const element = threat.id === 'element' && threat.element ? elementInfo[threat.element] : null;
          const pips = '●'.repeat(threat.level) + '○'.repeat(3 - threat.level);
          return (
            <View key={i} style={styles.logRow}>
              <View style={styles.bullet} />
              <GameIcon emoji={def.emoji} size={18} />
              {element ? <GameIcon emoji={element.emoji} size={18} /> : null}
              <Text style={styles.logLine}>
                {tr(def.name)} {pips} · {t(`expeditions.report.state.${threat.state}`)}
                {threat.forced ? t('expeditions.report.forced') : ''}
                {threat.intimidated ? t('expeditions.report.intimidated') : ''}
              </Text>
            </View>
          );
        })}
        {report.opportunity && (
          <View style={styles.logRow}>
            <View style={styles.bullet} />
            <GameIcon emoji={opportunityById[report.opportunity.id].emoji} size={18} />
            {report.opportunity.answered ? (
              <GainsLine gains={[tr(opportunityById[report.opportunity.id].name), ...opportunityGave(report.opportunity)]} labelStyle={styles.logLine} />
            ) : (
              <Text style={styles.logLine}>
                {tr(opportunityById[report.opportunity.id].name)} · {t('expeditions.report.opportunityMissed')}
              </Text>
            )}
          </View>
        )}
        {(report.salvaged ?? []).map((entry, i) => {
          const item = itemById[entry.itemId];
          const returns = [
            ...entry.materials.map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
            entry.gold ? `🪙 +${entry.gold}` : null,
          ]
            .filter((part): part is string => part !== null)
            .join(' · ');
          return (
            <View key={i} style={styles.logRow}>
              <View style={styles.bullet} />
              <Text style={styles.logLine}> {/* mixed-emoji-ok: the salvaged sentence wraps in a full-width paragraph */}
                {t('expeditions.report.salvaged', {
                  hero: heroes.find((h) => h.id === entry.heroId)?.name ?? entry.heroId,
                  item: `${item.emoji} ${tr(item.name)}`,
                  returns,
                })}
              </Text>
            </View>
          );
        })}
        {report.log.map((line, i) => (
          <View key={i} style={styles.logRow}>
            <View style={styles.bullet} />
            <Text style={styles.logLine}>{line}</Text>
          </View>
        ))}
      </View>

      {report.heroHp.map(({ heroId, hp, maxHp, before }) => (
        <View key={heroId} style={styles.hp}>
          <Text style={styles.hpName} numberOfLines={1}>
            {heroes.find((h) => h.id === heroId)?.name ?? heroId}
          </Text>
          <View style={styles.hpBar}>
            <PixelBar value={hp / maxHp} color={hp / maxHp < 0.3 ? ui.bad : ui.good} />
          </View>
          <Text style={styles.hpText}>
            {before === undefined ? `${hp}/${maxHp}` : t('expeditions.hpChange', { before, hp, max: maxHp })}
          </Text>
        </View>
      ))}
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  content: { gap: 6 },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: ui.woodMid,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  rowInner: { position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderWidth: 2, borderColor: ui.woodSeam },
  rowName: { flex: 1, fontSize: 16, color: ui.brassLight },
  rowWhen: { fontFamily: fonts.serif, fontSize: 12, color: ui.onWoodMuted },
  chevron: { fontSize: 20, color: ui.onWoodMuted },
  line: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  log: { gap: 5, borderTopWidth: 2, borderTopColor: ui.parchmentRule, borderStyle: 'dashed', paddingTop: 6 },
  logRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  bullet: { width: 7, height: 7, marginTop: 6, transform: [{ rotate: '45deg' }], backgroundColor: ui.brassDim },
  logLine: { fontFamily: fonts.serif, fontSize: 13, color: ui.ink },
  hp: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hpName: { width: 90, fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  hpBar: { flex: 1 },
  hpText: { fontFamily: fonts.serif, fontSize: 14, color: ui.inkMuted },
});
