import { Pressable, StyleSheet, View } from 'react-native';

import { dungeonById, itemById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { weaknessByBoss } from '@/content/weaknesses';
import type { Rotation } from '@/game/dungeons/rotation';
import { briefingOf, firstWinAvailable, isDungeonAvailable } from '@/game/expeditions/expeditions';
import { oddsBand } from '@/game/expeditions/odds';
import type { SaveData } from '@/game/save';
import { briefingCoverage } from '@/game/threats/coverage';
import { isTutorialDungeon } from '@/game/tutorial/tutorial';
import type { DungeonDef } from '@/game/types';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { colors, pixel } from '@/theme';

import { BriefingChips } from './BriefingChips';
import { Button } from './Button';
import { EnemyTags } from './EnemyTags';
import { IconSlot } from './Row';
import { ODDS_COLORS } from './SendDialog';
import { Text } from './Text';
import { ThreatCoverageChips } from './ThreatDetail';
import { GameIcon } from './GameIcon';
import { IconLabel, PartsLine } from './IconLabel';

type Props = {
  save: SaveData;
  dungeon: DungeonDef;
  rotation: Rotation;
  now: number;
  durationMs: number;
  /** Success chance with the selected party: undefined while it computes, null without one. */
  chance: number | null | undefined;
  expanded: boolean;
  onToggle: () => void;
  onSend: () => void;
};

/** A dungeon at a glance (name, kind, time, odds); tapped, its details and the Send button. */
export function DungeonCard({ save, dungeon, rotation, now, durationMs, chance, expanded, onToggle, onSend }: Props) {
  const band = typeof chance === 'number' ? oddsBand(chance) : null;
  const available = isDungeonAvailable(save, dungeon, rotation);
  const newTier = !save.clearedDungeons.some((id) => dungeonById[id]?.tier === dungeon.tier);
  const firstWin = firstWinAvailable(save, dungeon, now);
  const briefing = briefingOf(save, dungeon, rotation, now);
  // The tutorial shows its threat up front, against the whole roster: red until a hero carries the kit.
  const tutorial = save.tutorial.step !== 'done' && isTutorialDungeon(dungeon.id);
  const kind = dungeon.isBoss ? 'boss' : dungeon.slot === 'short' ? 'short' : 'long';
  const weakness = dungeon.isBoss ? weaknessByBoss[dungeon.boss.id] : undefined;
  const weaknessHeld =
    !!weakness &&
    ((save.consumables[weakness.itemId] ?? 0) > 0 || save.heroes.some((h) => h.equipment.consumable === weakness.itemId));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onToggle}
      style={[styles.card, dungeon.isBoss && styles.boss, expanded && styles.expanded]}
    >
      <View style={styles.header}>
        <IconSlot emoji={dungeon.emoji} />
        <View style={styles.title}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {tr(dungeon.name)}
            </Text>
            {newTier && <GameIcon emoji="✨" size={18} />}
          </View>
          <PartsLine
            parts={[t(`expeditions.kind.${kind}`), { emoji: '⏳', text: formatDuration(durationMs) }]}
            labelStyle={styles.muted}
          />
        </View>
        {typeof chance === 'number' && band ? (
          <View style={[styles.odds, { backgroundColor: ODDS_COLORS[band] }]}>
            <Text style={styles.oddsText}>{formatPercent(chance)}</Text>
          </View>
        ) : (
          chance === undefined && (
            <View style={[styles.odds, styles.oddsPending]}>
              <Text style={styles.oddsText}>…</Text>
            </View>
          )
        )}
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </View>
      {tutorial && (
        <ThreatCoverageChips
          coverage={briefingCoverage(save, save.heroes.map((h) => h.id), briefing, now, false)}
          labelled
        />
      )}

      {expanded && (
        <View style={styles.details}>
          {band && <Text style={styles.muted}>{t(`odds.${band}`)} · {t('expeditions.tips.odds')}</Text>}
          {!tutorial && <BriefingChips briefing={briefing} />}
          <View style={styles.foe}>
            <Text style={[styles.line, styles.muted]}>{t('expeditions.boss')}</Text>
            <EnemyTags mob={dungeon.boss} />
          </View>
          {newTier && <Text style={styles.line}>{t('expeditions.newTierBonus')}</Text>}
          {firstWin && <Text style={styles.line}>{t('expeditions.firstWinToday')}</Text>}
          {weakness && (
            <View style={styles.lineRow}>
              <IconLabel
                emoji={itemById[weakness.itemId].emoji}
                label={t('expeditions.weakness', {
                  item: tr(itemById[weakness.itemId].name),
                  place: tr(placeInfo[weakness.place].name).toLowerCase(),
                })}
                labelStyle={[styles.line, { color: weaknessHeld ? colors.success : colors.muted }]}
              />
              {weaknessHeld ? <Text style={[styles.line, { color: weaknessHeld ? colors.success : colors.muted }]}> {t('expeditions.weaknessHeld')}</Text> : null}
            </View>
          )}
          <View style={styles.footer}>
            {!available && <Text style={styles.muted}>{t('expeditions.afterTutorial')}</Text>}
            <Button title={t('expeditions.send')} disabled={!available || chance === null} onPress={onSend} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  card: { marginBottom: 8, padding: 8, gap: 6, borderWidth: pixel.outline, borderColor: colors.woodDark, backgroundColor: colors.parchment },
  boss: { borderColor: colors.danger },
  expanded: { backgroundColor: colors.highlight, borderColor: colors.ink },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1 },
  name: { fontSize: 21 },
  muted: { color: colors.muted },
  odds: { paddingHorizontal: 8, paddingVertical: 2, borderWidth: 2, borderColor: colors.ink },
  oddsPending: { backgroundColor: colors.parchmentDark },
  oddsText: { color: colors.parchment, fontSize: 18 },
  chevron: { fontSize: 22, color: colors.muted, width: 16 },
  details: { gap: 6 },
  foe: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  line: { fontSize: 17 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
});
