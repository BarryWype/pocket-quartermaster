import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Reanimated, { FadeOut, ReduceMotion } from 'react-native-reanimated';

import { useAfterFirstFrame } from '@/hooks/useAfterFirstFrame';
import { motion } from '@/content/motion';
import { useAnimationsEnabled } from '@/hooks/useAnimationFrame';
import { useMotion } from '@/hooks/useMotion';
import { recordTapToContent } from '@/services/timings';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { ui } from '@/theme';

/** What the content will look like: stacked cards, a slot grid, or a hero sheet. */
export type GhostVariant = 'cards' | 'grid' | 'hero';

const PULSE = { low: 0.35, high: 0.55, ms: 900 };

const FADE_AWAY = FadeOut.duration(motion.duration.small).reduceMotion(ReduceMotion.Never);

/**
 * Wraps a ghost: when the real content replaces it, the ghost fades out over
 * the content in the small duration (Full and Reduced), so the content shows
 * through without a jump: it is laid out in its final place from its first frame.
 */
export function GhostFade({ children }: { children: ReactNode }) {
  const { level } = useMotion();
  return (
    <Reanimated.View style={styles.fade} exiting={level === 'off' ? undefined : FADE_AWAY}>
      {children}
    </Reanimated.View>
  );
}

/** A parchment block with ParchmentCard's border and no text. */
function Block({ height, width, flex }: { height: number; width?: number; flex?: number }) {
  return <View style={[styles.block, { height }, width !== undefined && { width }, flex !== undefined && { flex }]} />;
}

/** The ghost content alone, for a page area: blocks shaped like the variant, pulsing slowly. */
export function GhostBody({ variant }: { variant: GhostVariant }) {
  const animated = useAnimationsEnabled();
  const [opacity] = useState(() => new Animated.Value((PULSE.low + PULSE.high) / 2));
  useEffect(() => {
    if (!animated) return;
    const to = (value: number) =>
      Animated.timing(opacity, { toValue: value, duration: PULSE.ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([to(PULSE.high), to(PULSE.low)]));
    loop.start();
    return () => loop.stop();
  }, [animated, opacity]);

  return (
    <Animated.View style={[styles.body, { opacity }]} pointerEvents="none" accessibilityElementsHidden>
      {variant === 'cards' && [120, 96, 120, 96].map((height, i) => <Block key={i} height={height} />)}
      {variant === 'grid' && (
        <>
          <Block height={22} width={140} />
          <View style={styles.grid}>
            {Array.from({ length: 16 }, (_, i) => (
              <Block key={i} height={56} width={56} />
            ))}
          </View>
        </>
      )}
      {variant === 'hero' && (
        <>
          <View style={styles.row}>
            <Block height={96} width={96} />
            <View style={styles.stats}>
              <Block height={22} />
              <Block height={14} />
              <Block height={14} />
            </View>
          </View>
          <Block height={28} />
          <View style={styles.grid}>
            {Array.from({ length: 8 }, (_, i) => (
              <Block key={i} height={56} width={56} />
            ))}
          </View>
        </>
      )}
    </Animated.View>
  );
}

/** A screen's ghost: its real rail, if it has one, beside the ghost content. The header is the stack's, real already. */
export function GhostScreen({ variant, rail }: { variant: GhostVariant; rail?: ReactNode }) {
  return (
    <View style={styles.screen}>
      {rail}
      <GhostBody variant={variant} />
    </View>
  );
}

/** Records `tap→content` once the content it wraps has committed. */
function ContentMark({ name, children }: { name: string; children: ReactNode }) {
  useLayoutEffect(() => recordTapToContent(name), [name]);
  return children;
}

/**
 * A screen's real content one frame after its ghost: the ghost paints first, so
 * a tap always shows it registered, then the content renders in its place.
 */
export function Deferred({ name, ghost, children }: { name: string; ghost: ReactNode; children: ReactNode }) {
  const ready = useAfterFirstFrame();
  const noDeferral = useDebugStore((state) => debugEnabled(state) && state.noContentDeferral);
  return ready || noDeferral ? <ContentMark name={name}>{children}</ContentMark> : <GhostFade>{ghost}</GhostFade>;
}

const styles = StyleSheet.create({
  fade: { flex: 1 },
  screen: { flex: 1, flexDirection: 'row', backgroundColor: ui.woodDark },
  body: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 10, backgroundColor: ui.woodDark },
  block: { borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.parchment },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
  stats: { flex: 1, gap: 8, justifyContent: 'center' },
});
