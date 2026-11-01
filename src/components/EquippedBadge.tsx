import { StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { ui } from '@/theme';

import { Text } from './Text';

type Props = {
  /** The icon square's size; the badge scales to it. */
  size: number;
};

/** A small shield pinned to an item's corner: someone is wearing this piece. */
export function EquippedBadge({ size }: Props) {
  return (
    <View style={[styles.badge, { width: size * 0.5, height: size * 0.5 }]} accessibilityLabel={t('gear.equipped')}>
      <Text style={{ fontSize: Math.round(size * 0.4) }}>🛡️</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: ui.woodDeep,
    borderWidth: 2,
    borderColor: ui.brass,
  },
});
