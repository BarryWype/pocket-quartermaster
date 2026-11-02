import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ui } from '@/theme';

import { Text } from './Text';

type Props = {
  /** 0–1. */
  value: number;
  color?: string;
  segments?: number;
  /** The track's height; the default fits a percentage. */
  height?: number;
  /** Content drawn over the bar's centre: a short string, or any node. */
  overlay?: ReactNode;
};

/** A segmented progress bar, filled block by block like a pixel-art gauge. */
export function PixelBar({ value, color = ui.xp, segments = 10, height = 16, overlay }: Props) {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * segments);
  return (
    <View style={[styles.track, { height }]}>
      {Array.from({ length: segments }, (_, i) => (
        <View key={i} style={[styles.segment, i < filled && { backgroundColor: color }]}>
          {i < filled && <View style={styles.highlight} pointerEvents="none" />}
        </View>
      ))}
      {overlay !== undefined && (
        <View style={styles.overlay} pointerEvents="none">
          {typeof overlay === 'string' ? <Text style={styles.overlayText}>{overlay}</Text> : overlay}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.outline,
  },
  segment: { flex: 1, backgroundColor: ui.woodDark },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  overlayText: { fontSize: 10, lineHeight: 12, textAlign: 'center', color: ui.parchment },
});
