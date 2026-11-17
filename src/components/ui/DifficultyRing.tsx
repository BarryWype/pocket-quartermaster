import type { ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import type { Difficulty } from '@/content/difficulty';
import { difficultyTokens, ui } from '@/theme';

type Props = {
  difficulty: Difficulty;
  /** A diamond ring for the map's rotated markers, a square one for list icons. */
  shape: 'diamond' | 'square';
  /** The wrapped content's width and height, before any rotation. */
  size: number;
  /** Replaces the ring's width, animated or not (the patrol "fresh" pulse). */
  ringWidth?: Animated.WithAnimatedValue<number>;
  /** The time left, drawn as a draining diamond outside the outermost ring. */
  time?: { left: number; last: boolean };
  /** The marker tile or icon; for a diamond, already rotated 45°. */
  children: ReactNode;
};

/**
 * The difficulty ring around a marker or icon, its colour and width from the
 * tokens; a boss also carries the outer brass ring.
 */
export function DifficultyRing({ difficulty, shape, size, ringWidth, time, children }: Props) {
  const token = difficultyTokens[difficulty];
  const outer = token.outerRing;
  const innerSide = size + token.width * 2;
  const outerSide = outer ? innerSide + outer.width * 2 : innerSide;
  // A rotated square's on-screen width is its side x 1.41.
  const span = shape === 'diamond' ? Math.round(outerSide * Math.SQRT2) : outerSide;
  const edge = (side: number) => ({ left: (span - side) / 2, top: (span - side) / 2 });
  const ringed = (
    <View style={[styles.root, { width: span, height: span }]}>
      {outer && (
        <View
          style={[
            styles.ring,
            shape === 'diamond' && styles.tilt,
            { width: outerSide, height: outerSide, borderWidth: outer.width, borderColor: outer.colour, ...edge(outerSide) },
          ]}
        />
      )}
      <Animated.View
        style={[
          styles.ring,
          shape === 'diamond' && styles.tilt,
          { width: innerSide, height: innerSide, borderWidth: ringWidth ?? token.width, borderColor: token.ring, ...edge(innerSide) },
        ]}
      />
      {children}
    </View>
  );
  return time ? (
    <TimeRing left={time.left} last={time.last} size={outerSide}>
      {ringed}
    </TimeRing>
  ) : (
    ringed
  );
}

/** The time ring's border width, and its gap to what it wraps. */
const TIME_WIDTH = 3;
const TIME_GAP = 2;
/** The track under the time left, faint over the whole perimeter. */
const TIME_TRACK = 'rgba(30,18,10,0.45)';

type TimeRingProps = {
  /** The share of life left, 0 to 1. */
  left: number;
  /** In its last day: the ring turns ember and carries an hourglass badge. */
  last: boolean;
  /** The wrapped diamond's side, before any rotation. */
  size: number;
  children: ReactNode;
};

/**
 * A diamond outline that drains clockwise from its top vertex over the wrapped
 * marker's life: a faint track around the whole perimeter, the time left on
 * top in brass (ember in its last day). Views only, no per-frame work.
 */
export function TimeRing({ left, last, size, children }: TimeRingProps) {
  const side = size + (TIME_GAP + TIME_WIDTH) * 2;
  const span = Math.round(side * Math.SQRT2);
  const edge = { left: (span - side) / 2, top: (span - side) / 2 };
  // Inside the rotated square the diamond's top vertex is its top-left corner, and clockwise along the diamond runs
  // the square's top side left to right, right side top to bottom, bottom side right to left, left side bottom to top.
  // The elapsed share grows along that path, so each side's remaining part sits at its far end.
  const elapsed = Math.min(1, Math.max(0, 1 - left)) * 4;
  const remaining = [0, 1, 2, 3].map((i) => 1 - Math.min(1, Math.max(0, elapsed - i)));
  // Each side's bar: its length is the side's remaining share, pinned to the side's far end.
  const barStyle = [
    { top: 0, right: 0, width: remaining[0] * side, height: TIME_WIDTH },
    { right: 0, bottom: 0, width: TIME_WIDTH, height: remaining[1] * side },
    { bottom: 0, left: 0, width: remaining[2] * side, height: TIME_WIDTH },
    { left: 0, top: 0, width: TIME_WIDTH, height: remaining[3] * side },
  ];
  return (
    <View style={[styles.root, { width: span, height: span }]}>
      <View style={[styles.timeFrame, styles.tilt, { width: side, height: side, ...edge }]}>
        <View style={styles.timeTrack} />
        {[0, 1, 2, 3]
          .filter((i) => remaining[i] > 0)
          .map((i) => (
            <View key={i} style={[styles.timeBar, barStyle[i], { backgroundColor: last ? ui.emberLight : ui.brass }]} />
          ))}
      </View>
      {last && (
        <View style={styles.hourglass}>
          <Text style={styles.hourglassEmoji}>⏳</Text>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2 },
  tilt: { transform: [{ rotate: '45deg' }] },
  timeFrame: { position: 'absolute' },
  // The track is its own layer, so the bars, placed against the frame's edges, lie exactly over it.
  timeTrack: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: TIME_WIDTH, borderColor: TIME_TRACK },
  timeBar: { position: 'absolute' },
  // The diamond's left point, its mid-height corner.
  hourglass: {
    position: 'absolute',
    left: -8,
    top: '50%',
    marginTop: -9,
    backgroundColor: ui.ember,
    borderWidth: 1,
    borderColor: ui.brass,
    borderRadius: 2,
    paddingHorizontal: 1,
  },
  hourglassEmoji: { fontSize: 14 },
});
