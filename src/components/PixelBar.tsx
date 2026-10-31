import { StyleSheet, View } from 'react-native';

import { ui } from '@/theme';

type Props = {
  /** 0–1. */
  value: number;
  color?: string;
  segments?: number;
};

/** A segmented progress bar, filled block by block like a pixel-art gauge. */
export function PixelBar({ value, color = ui.xp, segments = 10 }: Props) {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * segments);
  return (
    <View style={styles.track}>
      {Array.from({ length: segments }, (_, i) => (
        <View key={i} style={[styles.segment, i < filled && { backgroundColor: color }]}>
          {i < filled && <View style={styles.highlight} pointerEvents="none" />}
        </View>
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
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.outline,
  },
  segment: { flex: 1, backgroundColor: ui.woodDark },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
});
