import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GameIcon } from '@/components/GameIcon';
import type { NetworkBadge } from '@/game/supply/badges';
import { buildingCap, buildingStockTotal, settleBuilding } from '@/game/supply/production';
import type { Building } from '@/game/supply/types';
import type { SaveData } from '@/game/save';
import { formatDuration, t } from '@/i18n';
import { colors, ui } from '@/theme';

export const badgeEmoji: Record<NetworkBadge, string> = { raid: '⚔️', last: '⏳', full: '📦', idle: '🛒', nowork: '👤' };

/** What a building's badge says, for the marker's and the flow picture's accessibility labels. */
export function badgeLabel(save: SaveData, building: Building, badge: NetworkBadge, name: string, now: number): string {
  switch (badge) {
    case 'raid':
      return t('networkBadge.raid', { name, time: formatDuration(Math.max(0, (save.supply.raid?.landsAt ?? now) - now), false) });
    case 'last':
      return t('networkBadge.last', { name, time: formatDuration(Math.max(0, building.expiresAt - now), false) });
    case 'full':
      return t('networkBadge.full', { name, n: buildingStockTotal(settleBuilding(save, building, now)), cap: buildingCap(building) });
    case 'idle':
      return t('networkBadge.idle', { name });
    case 'nowork':
      return t('networkBadge.nowork', { name });
  }
}

/** The badge itself: its own icon on its own colour, so colour is never the only signal. The caller labels it. */
export function BadgeIcon({ badge, style }: { badge: NetworkBadge; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, styles[badge], style]} pointerEvents="none">
      <GameIcon emoji={badgeEmoji[badge]} size={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: ui.outline },
  raid: { backgroundColor: colors.danger },
  last: { backgroundColor: ui.ember },
  full: { backgroundColor: ui.brass },
  idle: { backgroundColor: ui.parchment },
  nowork: { backgroundColor: ui.woodDark },
});
