import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { formatNumber } from '@/i18n';
import { ui } from '@/theme';

import { GameIcon } from './GameIcon';
import { Text } from './Text';

/** The amount as it reads beside the coin, or a visible `?` when it is somehow not a usable number. */
export function formatPrice(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0) {
    if (__DEV__) console.warn(`Price got a bad amount: ${String(amount)}`);
    return '?';
  }
  return formatNumber(amount);
}

/** A gold label as one string, for lists that are later split by `parseGoldLabel` back into a `Price`. */
export const goldLabel = (amount: number, prefix = '') => `🪙 ${prefix}${amount}`;

/** The amount and sign a `goldLabel` holds, or null for any other label. */
export function parseGoldLabel(text: string): { amount: number; prefix: string } | null {
  const match = /^🪙\s*([+×]?)(\d+(?:\.\d+)?)$/.exec(text);
  return match ? { amount: Number(match[2]), prefix: match[1] } : null;
}

type Props = {
  amount: number | null | undefined;
  /** The top of a range, read "10–20". */
  to?: number;
  /** Written before the amount: "+" for a gain, "×" for a multiplier. */
  prefix?: string;
  /** The player can't afford it: the amount turns red. */
  short?: boolean;
  /** The coin's square size; the amount keeps its own style. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Every price and gold amount in the game: the coin and the amount as two
 * elements, so the game font (no emoji glyphs) can't mis-measure the run and
 * clip the number. It never shrinks, so a crowded row can't crush it either —
 * the noLoosePrice guard test fails on a coin drawn next to a number without it.
 */
export function Price({ amount, to, prefix = '', short = false, size = 18, style, textStyle }: Props) {
  const label = `${prefix}${formatPrice(amount)}${to === undefined ? '' : `–${formatPrice(to)}`}`;
  return (
    <View style={[styles.row, style]}>
      <GameIcon emoji="🪙" size={size} />
      <Text style={[styles.amount, textStyle, short && styles.short]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  amount: { flexShrink: 0 },
  short: { color: ui.bad },
});
