import { StyleSheet, View } from 'react-native';

import { GameIcon } from '@/components/GameIcon';
import { Text } from '@/components/Text';
import { clockConfig } from '@/content/clockConfig';
import { isLastDay } from '@/game/supply/buildings';
import { formatDuration, t } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { colors, ui } from '@/theme';

type Props = { expiresAt: number };

/**
 * The strip under a temporary sheet's header: how long the thing stays. In its
 * last day it turns ember and says so, in words as well as colour.
 */
export function TimerStrip({ expiresAt }: Props) {
  const now = useNow(clockConfig.minutesMs);
  const last = isLastDay(expiresAt, now);
  const time = formatDuration(Math.max(0, expiresAt - now), false);
  const sentence = `${t('supply.leavesIn', { time })}${last ? `, ${t('supply.lastDay')}` : ''}`;
  return (
    <View
      style={[styles.strip, last && styles.last]}
      accessibilityLabel={sentence}
    >
      <GameIcon emoji="⏳" size={16} />
      <Text style={[styles.time, last && styles.lastText]}>{t('supply.leavesIn', { time })}</Text>
      {last && <Text style={styles.tag}>{t('supply.lastDay')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
  },
  time: { flex: 1, color: ui.ink },
  last: { borderColor: colors.danger, backgroundColor: ui.ember },
  lastText: { color: ui.onEmber },
  tag: { color: ui.onEmber, fontSize: 12, letterSpacing: 1 },
});
