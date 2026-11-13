import { StyleSheet, View } from 'react-native';

import { PressScale } from '@/components/motion';

import { familyOfThreat, familyById } from '@/content/families';
import { threatById } from '@/content/lookup';
import { trophyOf } from '@/game/loot/generators';
import type { LootSourceId } from '@/game/loot/types';
import type { Readiness } from '@/game/threats/readiness';
import type { Briefing, DungeonDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { fonts, ui } from '@/theme';

import { GameIcon } from './GameIcon';
import { GemSocket } from './GemSocket';
import { Text } from './Text';
import { DifficultyPips, DifficultyRing, ParchmentCard } from './ui';

type Props = {
  dungeon: DungeonDef;
  briefing: Briefing;
  /** The band's second line: the duration, or the overnight run's. */
  sub: string;
  source: LootSourceId;
  firstWin: boolean;
  /** Null when the stamp does not apply (the overnight run, a place that can't be sent to yet). */
  readiness: Readiness | null;
  tilt: -1 | 0 | 1;
  disabled?: boolean;
  onPress: () => void;
};

const STAMP_COLOURS = { ready: ui.good, needsGear: ui.ember, missing: ui.bad } as const;

/** A place pinned on the expedition board: its needs as gem sockets, threats and rewards, and a readiness stamp. */
export function PlaceNotice({ dungeon, briefing, sub, source, firstWin, readiness, tilt, disabled, onPress }: Props) {
  const threats = briefing.threats.map((threat) => t('expeditions.notice.threat', { threat: tr(threatById[threat.id].name), level: threat.level }));
  const trophy = trophyOf(source);
  const rewards = [t('expeditions.notice.gold'), trophy ? t(`expeditions.notice.${trophy}`) : null, firstWin ? t('expeditions.notice.blueprint') : null]
    .filter((part): part is string => part !== null)
    .join(', ');
  const stamp =
    readiness === null
      ? null
      : readiness.kind === 'missing'
        ? t('expeditions.stamp.missing', { families: readiness.families.slice(0, 2).map((f) => tr(familyById[f].name).toUpperCase()).join(', ') })
        : t(`expeditions.stamp.${readiness.kind}`);
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={tr(dungeon.name)} accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled}>
      <ParchmentCard
        pinned
        tilt={tilt}
        title={tr(dungeon.name)}
        titleIconNode={
          <View style={styles.ringedIcon}>
            <DifficultyRing difficulty={dungeon.difficulty} shape="square" size={22}>
              <GameIcon emoji={dungeon.emoji} size={22} />
            </DifficultyRing>
            <DifficultyPips difficulty={dungeon.difficulty} />
          </View>
        }
        titleSub={sub}
        style={disabled && styles.disabled}
        contentStyle={styles.content}
      >
        <View style={styles.socketRow}>
          <View style={styles.sockets}>
            {briefing.threats.map((threat) => (
              <View key={threat.id} style={styles.group}>
                {Array.from({ length: threat.level }, (_, i) => (
                  <GemSocket key={i} family={familyOfThreat(threat.id)} />
                ))}
              </View>
            ))}
          </View>
          {stamp !== null && readiness !== null && (
            <View style={[styles.stamp, { borderColor: STAMP_COLOURS[readiness.kind] }]}>
              <View style={[styles.stampInner, { borderColor: STAMP_COLOURS[readiness.kind] }]}>
                <Text style={[styles.stampText, { color: STAMP_COLOURS[readiness.kind] }]}>{stamp}</Text>
              </View>
            </View>
          )}
        </View>
        <Text style={styles.line}>{[...threats, rewards].join(' · ')}</Text>
      </ParchmentCard>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.6 },
  ringedIcon: { alignItems: 'center' },
  content: { gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  socketRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  sockets: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  group: { flexDirection: 'row', gap: 4 },
  stamp: { padding: 1, borderWidth: 2, backgroundColor: 'rgba(242,228,194,0.85)', transform: [{ rotate: '-9deg' }] },
  stampInner: { paddingHorizontal: 7, borderWidth: 1 },
  stampText: { fontFamily: fonts.body, fontSize: 19, letterSpacing: 1 },
  line: { fontFamily: fonts.serif, fontSize: 15, color: ui.inkMuted },
});
