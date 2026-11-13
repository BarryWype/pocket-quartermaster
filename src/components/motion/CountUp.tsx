import { useEffect } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { motion, type MotionLevel } from '@/content/motion';
import { useLiveChange, type LiveChange } from '@/hooks/useLiveChange';
import { timing, useMotion } from '@/hooks/useMotion';
import { formatNumber, getLocale } from '@/i18n';
import { ui } from '@/theme';

import { Text, baseTextStyle } from '../Text';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** Room the ticking number may take past the final one, when it counts down from a longer number. */
const SPILL = 32;

/** A whole number grouped like `formatNumber` (1,234 / 1 234), cheap enough to run every frame on the UI thread. */
export function groupDigits(value: number, separator: string) {
  'worklet';
  const rounded = Math.round(value);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return rounded < 0 ? `-${digits}` : digits;
}

type Props = {
  /** A whole number. */
  value: number;
  style?: StyleProp<TextStyle>;
  /** A "+N" floats up from the number when it grows; off for a count that grows all the time (steps). */
  gain?: boolean;
};

/**
 * A number that ticks from its old value to its new one (Full), fades to the
 * new one (Reduced), or changes at once (Off). Only a change seen live
 * animates (`useLiveChange`): the first value, and one that changed while the
 * screen was covered, show as they are. The final number, in plain text, holds
 * the layout, so nothing around it moves while it ticks: the ticking digits
 * are drawn over it on the UI thread (mounted from the first change). A gain
 * also floats a "+N" up from it.
 */
export function CountUp({ value, style, gain = true }: Props) {
  const { level } = useMotion();
  const change = useLiveChange(value);
  // Plain text until it first changes: a screen full of counts costs what its texts cost.
  if (change.changes === 0 || level === 'off') return <Text style={style}>{formatNumber(value)}</Text>;
  return <Counting change={change} level={level} style={style} gain={gain} />;
}

/** A count that has changed: the final number holds the layout, the ticker and the "+N" are drawn over it. */
function Counting({ change, level, style, gain }: { change: LiveChange<number>; level: MotionLevel; style?: StyleProp<TextStyle>; gain: boolean }) {
  const shown = useSharedValue(change.from);
  const ticking = useSharedValue(0);
  const fade = useSharedValue(1);
  const separator = getLocale() === 'fr' ? '\u00a0' : ',';

  useEffect(() => {
    if (change.live && level === 'full') {
      ticking.set(1);
      shown.set(
        withTiming(change.value, timing('medium'), (finished) => {
          if (finished) ticking.set(0);
        }),
      );
      return;
    }
    ticking.set(0);
    shown.set(change.value);
    if (change.live && level === 'reduced') fade.set(withSequence(withTiming(0.3, { duration: 0 }), withTiming(1, timing('small'))));
  }, [change, level, shown, ticking, fade]);

  const finalStyle = useAnimatedStyle(() => ({ opacity: (1 - ticking.value) * fade.value }));
  const tickerStyle = useAnimatedStyle(() => ({ opacity: ticking.value }));
  const tickerProps = useAnimatedProps(() => ({ text: groupDigits(shown.value, separator) }) as object);

  const align = StyleSheet.flatten(style)?.textAlign;
  const spill = align === 'right' ? { left: -SPILL, right: 0 } : align === 'center' ? { left: -SPILL, right: -SPILL } : { left: 0, right: -SPILL };
  const floating = gain && change.live && change.value > change.from;

  return (
    <View>
      <Animated.View style={finalStyle}>
        <Text style={style}>{formatNumber(change.value)}</Text>
      </Animated.View>
      {level === 'full' && (
        <AnimatedTextInput
          editable={false}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          underlineColorAndroid="transparent"
          defaultValue={formatNumber(change.from)}
          animatedProps={tickerProps}
          style={[baseTextStyle, style, styles.ticker, spill, tickerStyle]}
        />
      )}
      {floating && <GainFloat key={change.changes} amount={change.value - change.from} level={level} style={style} />}
    </View>
  );
}

/** "+N" over the number: it rises (Full only) while it shows, holds, then fades, once. */
function GainFloat({ amount, level, style }: { amount: number; level: MotionLevel; style?: StyleProp<TextStyle> }) {
  const rise = useSharedValue(0);
  const opacity = useSharedValue(1);
  useEffect(() => {
    const { medium, large } = motion.duration;
    if (level === 'full') rise.set(withTiming(1, { ...timing('large'), duration: medium + large }));
    opacity.set(withDelay(medium, withTiming(0, timing('large'))));
    // It floats once, when it mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const floating = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: -motion.gainRise * rise.value }] }));
  return (
    <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.gain, floating]}>
      <Text style={[style, styles.gainText]} numberOfLines={1}>{`+${formatNumber(amount)}`}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ticker: { position: 'absolute', top: 0, bottom: 0, margin: 0, padding: 0, paddingVertical: 0, paddingHorizontal: 0, borderWidth: 0 },
  gain: { position: 'absolute', bottom: '100%', left: 0 },
  gainText: { color: ui.good, textShadowColor: ui.outline, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
});
