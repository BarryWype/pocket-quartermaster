import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { formatNumber } from '@/i18n';

import { Text } from './Text';

/** The price with its coin, or a visible `?` when the price is somehow not a usable number. */
export function priceLabel(price: number | null | undefined): string {
  if (price === null || price === undefined || !Number.isFinite(price) || price < 0) {
    if (__DEV__) console.warn(`priceLabel got a bad price: ${String(price)}`);
    return '🪙 ?';
  }
  return `🪙 ${formatNumber(price)}`;
}

/** A shop price; can shrink but never be crushed out of a `space-between` row. */
export function PriceTag({ price, style }: { price: number | null | undefined; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.tag, style]}>{priceLabel(price)}</Text>;
}

const styles = StyleSheet.create({
  tag: { flexShrink: 1 },
});
