import { Pressable, StyleSheet, View } from 'react-native';

import { dungeonById, itemById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { weaknessByBoss } from '@/content/weaknesses';
import { briefingFor, type Rotation } from '@/game/dungeons/rotation';
import { firstWinAvailable, isDungeonAvailable } from '@/game/expeditions/expeditions';
import { oddsBand } from '@/game/expeditions/odds';
import type { SaveData } from '@/game/save';
import type { DungeonDef } from '@/game/types';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { colors, pixel } from '@/theme';

import { BriefingChips } from './BriefingChips';
import { Button } from './Button';
import { EnemyTags } from './EnemyTags';
import { IconSlot } from './Row';
import { ODDS_COLORS } from './SendDialog';
import { Text } from './Text';

type Props = {
  save: SaveData;
  dungeon: DungeonDef;
  rotation: Rotation;
  now: number;
  durationMs: number;
  /** Success chance with the selected party, or null without one. */
  chance: number | null;
  expanded: boolean;
  onToggle: () => void;
  onSend: () => void;
};

/** A dungeon at a glance (name, kind, time, odds); tapped, its details and the Send button. */
export function DungeonCard({ save, dungeon, rotation, now, durationMs, chance, expanded, onToggle, onSend }: Props) {
  const band = chance === null ? null : oddsBand(chance);
  const available = isDungeonAvailable(save, dungeon, rotation);
  const newTier = !save.clearedDungeons.some((id) => dungeonById[id]?.tier === dungeon.tier);
  const firstWin = firstWinAvailable(save, dungeon, now);
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
          <Text style={styles.name} numberOfLines={1}>
            {tr(dungeon.name)}
            {newTier ? ' ✨' : ''}
          </Text>
          <Text style={styles.muted}>
            {t(`expeditions.kind.${kind}`)} · ⏳ {formatDuration(durationMs)}
          </Text>
        </View>
        {band && chance !== null && (
          <View style={[styles.odds, { backgroundColor: ODDS_COLORS[band] }]}>
            <Text style={styles.oddsText}>{formatPercent(chance)}</Text>
          </View>
        )}
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </View>

      {expanded && (
        <View style={styles.details}>
          {band && <Text style={styles.muted}>{t(`odds.${band}`)} · {t('expeditions.tips.odds')}</Text>}
          <BriefingChips briefing={briefingFor(rotation, dungeon)} />
          <View style={styles.foe}>
            <Text style={[styles.line, styles.muted]}>{t('expeditions.boss')}</Text>
            <EnemyTags mob={dungeon.boss} />
          </View>
          {newTier && <Text style={styles.line}>{t('expeditions.newTierBonus')}</Text>}
          {firstWin && <Text style={styles.line}>{t('expeditions.firstWinToday')}</Text>}
          {weakness && (
            <Text style={[styles.line, { color: weaknessHeld ? colors.success : colors.muted }]}>
              {itemById[weakness.itemId].emoji}{' '}
              {t('expeditions.weakness', {
                item: tr(itemById[weakness.itemId].name),
                place: tr(placeInfo[weakness.place].name).toLowerCase(),
              })}
              {weaknessHeld ? t('expeditions.weaknessHeld') : ''}
            </Text>
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
  card: { marginBottom: 8, padding: 8, gap: 6, borderWidth: pixel.outline, borderColor: colors.woodDark, backgroundColor: colors.parchment },
  boss: { borderColor: colors.danger },
  expanded: { backgroundColor: colors.highlight, borderColor: colors.ink },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1 },
  name: { fontSize: 21 },
  muted: { color: colors.muted },
  odds: { paddingHorizontal: 8, paddingVertical: 2, borderWidth: 2, borderColor: colors.ink },
  oddsText: { color: colors.parchment, fontSize: 18 },
  chevron: { fontSize: 22, color: colors.muted, width: 16 },
  details: { gap: 6 },
  foe: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  line: { fontSize: 17 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
});
