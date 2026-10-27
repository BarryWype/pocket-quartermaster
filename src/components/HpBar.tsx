import { StyleSheet, View } from 'react-native';

import { healthRules } from '@/content/health';
import type { SaveData } from '@/game/save';
import { currentHp, isExhausted, maxHp, timeToFull } from '@/game/team/health';
import { isOnExpedition } from '@/game/team/team';
import type { HeroState } from '@/game/types';
import { formatDuration, t } from '@/i18n';
import { colors } from '@/theme';

import { PixelBar } from './PixelBar';
import { Text } from './Text';

type Props = {
  save: SaveData;
  hero: HeroState;
  now: number;
  /** Lighter text, e.g. on a dark header. */
  light?: boolean;
};

/** A hero's HP now, with how long until they are full or no longer exhausted. */
export function HpBar({ save, hero, now, light }: Props) {
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
      <PixelBar value={share} color={share < healthRules.hurtShare ? colors.danger : colors.success} />
      <Text style={[styles.text, light && styles.light]}>
        ❤️ {t('health.hp', { hp: Math.floor(hp), max })}
        {status ? ` · ${status}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, color: colors.muted },
  light: { color: colors.parchment },
});
