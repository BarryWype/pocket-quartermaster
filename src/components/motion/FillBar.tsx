import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { motion, type MotionLevel } from '@/content/motion';
import { useLiveChange } from '@/hooks/useLiveChange';
import { timing, useMotion } from '@/hooks/useMotion';
import { ui } from '@/theme';

import { Text } from '../Text';

type Props = {
  /** 0–1. */
  value: number;
  color?: string;
  /** Blocks in the gauge; 1 makes a smooth bar that fills to the exact share. */
  segments?: number;
  /** The track's height; the default fits a percentage. */
  height?: number;
  /** Content drawn over the bar's centre: a short string, or any node. */
  overlay?: ReactNode;
};

/** How much of block `index` a fill of `amount` blocks covers, 0 to 1. */
const coverOf = (amount: number, index: number) => Math.min(1, Math.max(0, amount - index));

/**
 * The segmented pixel gauge, whose fill moves to its new value, up or down:
 * the blocks that change fill from the left (or empty from the right) one
 * after another (Full), fade in or out (Reduced), or the fill jumps (Off).
 * Only a change seen live moves (`useLiveChange`): the first value, and one
 * that changed while the screen was covered, show as is. The blocks are plain
 * views; only the ones moving in a live change are animated, so a screen of
 * bars costs what plain views cost.
 */
export function FillBar({ value, color = ui.xp, segments = 10, height = 16, overlay }: Props) {
  const { level } = useMotion();
  const share = Math.min(1, Math.max(0, value));
  const change = useLiveChange(segments === 1 ? share : Math.round(share * segments));
  const blocks = Array.from({ length: segments }, (_, i) => i);
  const moving = change.live && level !== 'off' ? blocks.filter((i) => coverOf(change.from, i) !== coverOf(change.value, i)) : [];
  if (change.value < change.from) moving.reverse();
  const step = motion.duration.medium / Math.max(1, moving.length);

  return (
    <View style={[styles.track, { height }]}>
      {blocks.map((i) => {
        const order = moving.indexOf(i);
        return order >= 0 ? (
          <MovingBlock
            key={`${i}:${change.changes}`}
            from={coverOf(change.from, i)}
            to={coverOf(change.value, i)}
            delay={order * step}
            duration={step}
            color={color}
            level={level}
          />
        ) : (
          <Block key={i} cover={coverOf(change.value, i)} color={color} />
        );
      })}
      {overlay !== undefined && (
        <View style={styles.overlay} pointerEvents="none">
          {typeof overlay === 'string' ? <Text style={styles.overlayText}>{overlay}</Text> : overlay}
        </View>
      )}
    </View>
  );
}

function Block({ cover, color }: { cover: number; color: string }) {
  return (
    <View style={styles.segment}>
      {cover > 0 && (
        <View style={[styles.fill, { backgroundColor: color }, cover < 1 && { transform: [{ scaleX: cover }] }]} pointerEvents="none">
          <View style={styles.highlight} />
        </View>
      )}
    </View>
  );
}

/** A block in a live change: it grows or shrinks (Full) or fades (Reduced) from its old cover to its new one, after its turn. */
function MovingBlock({ from, to, delay, duration, color, level }: { from: number; to: number; delay: number; duration: number; color: string; level: MotionLevel }) {
  const cover = useSharedValue(from);
  useEffect(() => {
    cover.set(withDelay(delay, withTiming(to, { ...timing('medium', 'inOut'), duration })));
    // It moves once, when the change mounts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fill = useAnimatedStyle(() => (level === 'full' ? { transform: [{ scaleX: cover.value }] } : { opacity: cover.value }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} pointerEvents="none">
        <View style={styles.highlight} />
      </Animated.View>
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
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, transformOrigin: 'left' },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  overlayText: { fontSize: 10, lineHeight: 12, textAlign: 'center', color: ui.parchment },
});
