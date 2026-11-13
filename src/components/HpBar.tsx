import { StyleSheet, View } from 'react-native';

import { clockConfig } from '@/content/clockConfig';
import { healthRules } from '@/content/health';
import { systemIcons } from '@/content/systemIcons';
import type { SaveData } from '@/game/save';
import { currentHp, isExhausted, maxHp, timeToFull } from '@/game/team/health';
import { isOnExpedition } from '@/game/team/team';
import type { HeroState } from '@/game/types';
import { formatDuration, t } from '@/i18n';
import { colors, fonts } from '@/theme';
import { useNow } from '@/hooks/useNow';

import { FillBar } from '@/components/motion';
import { Text } from './Text';
import { IconLabel } from './IconLabel';

type Props = {
  save: SaveData;
  hero: HeroState;
  /** Lighter text, e.g. on a dark header. */
  light?: boolean;
  /** Draw the count inside a taller bar, heart and all, with nothing below it. */
  inBar?: boolean;
};

/** A hero's HP now, with how long until they are full or no longer exhausted. */
export function HpBar({ save, hero, light, inBar }: Props) {
  // Its own clock, so healing ticks without re-rendering the screen around it.
  const now = useNow(clockConfig.minutesMs);
  const max = maxHp(save, hero);
  const hp = currentHp(save, hero, now);
  const share = max > 0 ? hp / max : 0;
  const status = isExhausted(hero, now)
    ? t('health.exhausted', { time: formatDuration((hero.exhaustedUntil ?? now) - now) })
    : hp >= max
      ? t('health.full')
      : isOnExpedition(save, hero.id)
        ? ''
        : t('health.fullIn', { time: formatDuration(timeToFull(save, hero, now)) });
  return (
    <View>
      <FillBar
        value={share}
        color={share < healthRules.hurtShare ? colors.danger : colors.success}
        height={inBar ? 32 : undefined}
        overlay={
          inBar ? (
            <IconLabel
              emoji="❤️"
              icon={systemIcons['❤️']}
              label={t('health.hpCount', { hp: Math.floor(hp), max })}
              size={14}
              labelStyle={[styles.count, light && styles.light]}
            />
          ) : undefined
        }
      />
      {!inBar && (
        <View style={styles.row}>
          <IconLabel
            emoji="❤️"
              icon={systemIcons['❤️']}
            label={t('health.hp', { hp: Math.floor(hp), max })}
            labelStyle={[styles.text, light && styles.light]}
          />
          {status ? <Text style={[styles.text, light && styles.light]}> · {status}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  text: { fontSize: 16, color: colors.muted },
  count: { fontFamily: fonts.serifBold, fontSize: 14, color: colors.parchment },
  light: { color: colors.parchment },
});
