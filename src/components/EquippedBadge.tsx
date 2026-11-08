import { StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { ui } from '@/theme';

import { Text } from './Text';

type Props = {
  /** The icon square's size; the badge scales to it. */
  size: number;
};

/** A small shirt pinned to an item's corner: someone is wearing this piece. */
export function EquippedBadge({ size }: Props) {
  return (
    <View style={[styles.badge, { width: size * 0.25, height: size * 0.25 }]} accessibilityLabel={t('gear.equipped')}>
      <Text style={{ fontSize: Math.round(size * 0.2) }}>👕</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: ui.woodDeep,
  },
});
