import { StyleSheet, View } from 'react-native';

import { overnightExpeditionRules } from '@/content/dungeons';
import { briefingFor, type Rotation } from '@/game/dungeons/rotation';
import { isDungeonAvailable, expeditionMinutes, overnightUnderWay } from '@/game/expeditions/expeditions';
import { oddsBand } from '@/game/expeditions/odds';
import type { SaveData } from '@/game/save';
import type { DungeonDef } from '@/game/types';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { BriefingChips } from './BriefingChips';
import { RewardLabel } from './IconLabel';
import { Chip, EmberButton, ParchmentCard } from './ui';
import { Text } from './Text';

type Props = {
  save: SaveData;
  dungeon: DungeonDef;
  rotation: Rotation;
  now: number;
  /** Success chance with the selected party: undefined while it computes, null without one. */
  chance: number | null | undefined;
  onSend: () => void;
};

const pad = (n: number) => String(n).padStart(2, '0');
const clockTime = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;

const ODDS_TONE = { Safe: 'good', Fair: 'neutral', Risky: 'bad' } as const;

/** The tier's overnight expedition: a long, safe patrol for heroes with a long night ahead. */
export function OvernightCard({ save, dungeon, rotation, now, chance, onSend }: Props) {
  const durationMs = expeditionMinutes(save, dungeon) * 60_000;
  const band = typeof chance === 'number' ? oddsBand(chance) : null;
  const available = isDungeonAvailable(save, dungeon) && !overnightUnderWay(save);
  const underWay = overnightUnderWay(save);

  return (
    <ParchmentCard
      title={tr(dungeon.name)}
      titleEmoji={dungeon.emoji}
      titleSub={`${t('expeditions.overnight.title')} · ${formatDuration(durationMs)} · ${t('expeditions.overnight.back', { time: clockTime(now + durationMs) })}`}
      contentStyle={styles.content}
    >
      <View style={styles.metaRow}>
        {band && typeof chance === 'number' ? (
          <Chip tone={ODDS_TONE[band]} label={`${t(`odds.${band}`)} ${formatPercent(chance)}`} />
        ) : (
          chance === undefined && <Chip tone="neutral" label="…" />
        )}
      </View>
      <RewardLabel
        text={t('expeditions.overnight.rewards', {
          gold: `${dungeon.gold[0]}–${dungeon.gold[1]}`,
          xp: dungeon.xp,
        })}
        size={16}
        labelStyle={styles.line}
      />
      <BriefingChips briefing={briefingFor(rotation, dungeon)} />
      <Text style={styles.sub}>{t('expeditions.overnight.hint', { runs: overnightExpeditionRules.goldRunsWorth })}</Text>
      {underWay && <Text style={styles.sub}>{t('expeditions.overnight.underWay')}</Text>}
      <View style={styles.footer}>
        <EmberButton title={t('expeditions.send')} compact disabled={!available || chance === null} onPress={onSend} />
      </View>
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  content: { gap: 7 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  sub: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  footer: { flexDirection: 'row', justifyContent: 'flex-end' },
});
