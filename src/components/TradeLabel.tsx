import type { StyleProp, ViewStyle } from 'react-native';

import { tradeInfo, type TradeId } from '@/content/supplyLines';
import { tradeLevel } from '@/game/supply/trades';
import { t, tr } from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';

import { IconLabel } from './IconLabel';

/** A hero's supply-lines trade and its level; nothing while the feature is off. */
export function TradeLabel({ trade, hours = 0, style }: { trade: TradeId; hours?: number; style?: StyleProp<ViewStyle> }) {
  const on = useSettingsStore((s) => s.supplyLines);
  if (!on) return null;
  return (
    <IconLabel
      emoji={tradeInfo[trade].emoji}
      label={t('supply.tradeLine', { trade: tr(tradeInfo[trade].name), level: tradeLevel(hours) })}
      size={16}
      style={style}
    />
  );
}
