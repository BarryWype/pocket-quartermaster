import { StyleSheet, View } from 'react-native';

import { overnightExpeditionRules } from '@/content/dungeons';
import { briefingFor, type Rotation } from '@/game/dungeons/rotation';
import { isDungeonAvailable, expeditionMinutes, overnightUnderWay } from '@/game/expeditions/expeditions';
import type { SaveData } from '@/game/save';
import type { DungeonDef } from '@/game/types';
import { formatDuration, t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { BriefingChips } from './BriefingChips';
import { GameIcon } from './GameIcon';
import { RewardLabel } from './IconLabel';
import { Price } from './Price';
import { DifficultyPips, DifficultyRing, EmberButton, ParchmentCard } from './ui';
import { Text } from './Text';

type Props = {
  save: SaveData;
  dungeon: DungeonDef;
  rotation: Rotation;
  now: number;
  onSend: () => void;
};

const pad = (n: number) => String(n).padStart(2, '0');
const clockTime = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;

/** The tier's overnight expedition: a long, safe patrol for heroes with a long night ahead. */
export function OvernightCard({ save, dungeon, rotation, now, onSend }: Props) {
  const durationMs = expeditionMinutes(save, dungeon) * 60_000;
  const available = isDungeonAvailable(save, dungeon) && !overnightUnderWay(save);
  const underWay = overnightUnderWay(save);

  return (
    <ParchmentCard
      title={tr(dungeon.name)}
      titleIconNode={
        <View style={styles.ringedIcon}>
          <DifficultyRing difficulty={dungeon.difficulty} shape="square" size={22}>
            <GameIcon emoji={dungeon.emoji} size={22} />
          </DifficultyRing>
          <DifficultyPips difficulty={dungeon.difficulty} />
        </View>
      }
      titleSub={`${t('expeditions.overnight.title')} · ${formatDuration(durationMs)} · ${t('expeditions.overnight.back', { time: clockTime(now + durationMs) })}`}
      contentStyle={styles.content}
    >
      <View style={styles.rewardsRow}>
        <Price amount={dungeon.gold[0]} to={dungeon.gold[1]} size={16} textStyle={styles.line} />
        <RewardLabel
          text={t('expeditions.overnight.rewards', {
            xp: dungeon.xp,
          })}
          size={16}
          labelStyle={styles.line}
        />
      </View>
      <BriefingChips briefing={briefingFor(rotation, dungeon)} />
      <Text style={styles.sub}>{t('expeditions.overnight.hint', { runs: overnightExpeditionRules.goldRunsWorth })}</Text>
      {underWay && <Text style={styles.sub}>{t('expeditions.overnight.underWay')}</Text>}
      <View style={styles.footer}>
        <EmberButton title={t('expeditions.send')} compact disabled={!available} onPress={onSend} />
      </View>
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  ringedIcon: { alignItems: 'center' },
  content: { gap: 7 },
  rewardsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  line: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  sub: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  footer: { flexDirection: 'row', justifyContent: 'flex-end' },
});
