import { Pressable, StyleSheet, View } from 'react-native';

import { dungeonById, itemById } from '@/content/lookup';
import type { ExpeditionReport, HeroState } from '@/game/types';
import { formatDuration, t, tr } from '@/i18n';
import { colors, pixel } from '@/theme';

import { lootItems, OUTCOME_COLORS } from './LootReveal';
import { PixelBar } from './PixelBar';
import { IconSlot } from './Row';
import { Text } from './Text';

type Props = {
  report: ExpeditionReport;
  heroes: HeroState[];
  now: number;
  expanded: boolean;
  onToggle: () => void;
};

/** A finished expedition: outcome and loot at a glance; tapped, the full log and how the heroes came back. */
export function ReportCard({ report, heroes, now, expanded, onToggle }: Props) {
  const dungeon = dungeonById[report.dungeonId];
  const color = OUTCOME_COLORS[report.outcome];
  const extras = [
    report.hunger && report.hunger !== 'fed' ? t(`expeditions.hunger.${report.hunger}`) : null,
    report.mealId ? `${itemById[report.mealId].emoji} ${tr(itemById[report.mealId].name)}` : null,
    report.kitId
      ? `${itemById[report.kitId].emoji} ${t(report.kitUsed ? 'expeditions.kitUsed' : 'expeditions.kitBack', { kit: tr(itemById[report.kitId].name) })}`
      : null,
  ].filter((item): item is string => item !== null);
  const loot = [...lootItems(report), `+${report.xp} XP`];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onToggle}
      style={[styles.card, { borderColor: color }, !report.seen && styles.unseen]}
    >
      <View style={styles.header}>
        <IconSlot emoji={dungeon.emoji} />
        <View style={styles.title}>
          <Text style={styles.name} numberOfLines={1}>
            {tr(dungeon.name)}
            {report.seen ? '' : t('expeditions.new')}
          </Text>
          <Text style={{ color }}>
            {t(`expeditions.outcome.${report.outcome}`)} ({report.encountersCleared}/{report.encounterCount}) ·{' '}
            <Text style={styles.muted}>{t('expeditions.ago', { time: formatDuration(now - report.finishedAt) })}</Text>
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </View>
      <View style={styles.chips}>
        {(expanded ? [...loot, ...extras] : loot.slice(0, 4)).map((item, i) => (
          <View key={i} style={styles.chip}>
            <Text style={styles.chipText}>{item}</Text>
          </View>
        ))}
        {!expanded && loot.length > 4 && <Text style={styles.muted}>+{loot.length - 4}</Text>}
      </View>

      {expanded && (
        <View style={styles.details}>
          {report.log.map((line, i) => (
            <Text key={i} style={styles.logLine}>
              {line}
            </Text>
          ))}
          {report.heroHp.map(({ heroId, hp, maxHp, before }) => (
            <View key={heroId} style={styles.hp}>
              <Text style={styles.hpName} numberOfLines={1}>
                {heroes.find((h) => h.id === heroId)?.name ?? heroId}
              </Text>
              <View style={styles.hpBar}>
                <PixelBar value={hp / maxHp} color={hp / maxHp < 0.3 ? colors.danger : colors.success} />
              </View>
              <Text style={styles.muted}>
                {before === undefined ? `${hp}/${maxHp}` : t('expeditions.hpChange', { before, hp, max: maxHp })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 8, padding: 8, gap: 6, borderWidth: pixel.outline, backgroundColor: colors.parchment },
  unseen: { backgroundColor: colors.highlight },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1 },
  name: { fontSize: 20 },
  muted: { color: colors.muted },
  chevron: { fontSize: 22, color: colors.muted, width: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: colors.woodDark, backgroundColor: colors.parchmentDark },
  chipText: { fontSize: 17 },
  details: { gap: 4 },
  logLine: { fontSize: 18 },
  hp: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hpName: { width: 90 },
  hpBar: { flex: 1 },
});
