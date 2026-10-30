import { StyleSheet, View } from 'react-native';

import { overnightQuestRules } from '@/content/dungeons';
import { briefingFor, type Rotation } from '@/game/dungeons/rotation';
import { isDungeonAvailable, expeditionMinutes, overnightUnderWay } from '@/game/expeditions/expeditions';
import { oddsBand } from '@/game/expeditions/odds';
import type { SaveData } from '@/game/save';
import type { DungeonDef } from '@/game/types';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { colors, pixel } from '@/theme';

import { BriefingChips } from './BriefingChips';
import { Button } from './Button';
import { IconSlot } from './Row';
import { Text } from './Text';
import { ODDS_COLORS } from './SendDialog';

type Props = {
  save: SaveData;
  dungeon: DungeonDef;
  rotation: Rotation;
  now: number;
  /** Success chance with the selected party, or null without one. */
  chance: number | null;
  onSend: () => void;
};

const pad = (n: number) => String(n).padStart(2, '0');
const clockTime = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;

/** The tier's overnight quest: a long, safe patrol for heroes with a long night ahead. */
export function OvernightCard({ save, dungeon, rotation, now, chance, onSend }: Props) {
  const durationMs = expeditionMinutes(save, dungeon) * 60_000;
  const band = chance === null ? null : oddsBand(chance);
  const available = isDungeonAvailable(save, dungeon) && !overnightUnderWay(save);
  const underWay = overnightUnderWay(save);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <IconSlot emoji={dungeon.emoji} />
        <View style={styles.title}>
          <Text style={styles.name}>{tr(dungeon.name)}</Text>
          <Text style={styles.muted}>
            {t('expeditions.overnight.title')} · ⏳ {formatDuration(durationMs)} · {t('expeditions.overnight.back', { time: clockTime(now + durationMs) })}
          </Text>
        </View>
        {band && chance !== null && (
          <View style={[styles.odds, { backgroundColor: ODDS_COLORS[band] }]}>
            <Text style={styles.oddsText}>{formatPercent(chance)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.line}>
        {t('expeditions.overnight.rewards', {
          gold: `${dungeon.gold[0]}–${dungeon.gold[1]}`,
          xp: dungeon.xp,
        })}
      </Text>
      <BriefingChips briefing={briefingFor(rotation, dungeon)} />
      <Text style={styles.muted}>{t('expeditions.overnight.hint', { runs: overnightQuestRules.goldRunsWorth })}</Text>
      {underWay && <Text style={styles.muted}>{t('expeditions.overnight.underWay')}</Text>}
      <View style={styles.footer}>
        <Button title={t('expeditions.send')} disabled={!available || chance === null} onPress={onSend} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 8, padding: 8, gap: 6, borderWidth: pixel.outline, borderColor: colors.ink, backgroundColor: colors.parchmentDark },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1 },
  name: { fontSize: 21 },
  muted: { color: colors.muted },
  line: { fontSize: 17 },
  odds: { paddingHorizontal: 8, paddingVertical: 2, borderWidth: 2, borderColor: colors.ink },
  oddsText: { color: colors.parchment, fontSize: 18 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end' },
});
