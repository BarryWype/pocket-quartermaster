import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, pixel } from '@/theme';

type Props = {
  children: ReactNode;
  /** The fill; the bevel and outline are drawn around it. */
  color?: string;
  /** E.g. a quality or outcome colour. */
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
};

/** A pixel-art frame: dark outline, bevelled edge, flat fill. */
export function Panel({ children, color = colors.parchment, borderColor = colors.ink, style }: Props) {
  return (
    <View style={[styles.outline, { borderColor }]}>
      <View style={[styles.face, { backgroundColor: color }, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outline: { borderWidth: pixel.outline, marginBottom: 10 },
  face: {
    padding: 10,
    gap: 6,
    borderWidth: pixel.bevel,
    borderTopColor: colors.bevelLight,
    borderLeftColor: colors.bevelLight,
    borderBottomColor: colors.bevelDark,
    borderRightColor: colors.bevelDark,
  },
});
