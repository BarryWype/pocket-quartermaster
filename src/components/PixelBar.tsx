import { StyleSheet, View } from 'react-native';

import { colors, pixel } from '@/theme';

type Props = {
  /** 0–1. */
  value: number;
  color?: string;
  segments?: number;
};

/** A segmented progress bar, filled block by block like a pixel-art gauge. */
export function PixelBar({ value, color = colors.gold, segments = 10 }: Props) {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * segments);
  return (
    <View style={styles.track}>
      {Array.from({ length: segments }, (_, i) => (
        <View key={i} style={[styles.segment, i < filled && { backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    height: 16,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  segment: { flex: 1, backgroundColor: colors.woodDark },
});
