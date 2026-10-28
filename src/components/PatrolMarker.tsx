import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import type { PatrolSubject } from '@/game/patrols/generate';
import { useAnimationsEnabled } from '@/hooks/useAnimationFrame';
import { colors, pixel } from '@/theme';

import { Text } from './Text';

/** One icon per kind of patrol or traveller. */
export const patrolIcons: Record<PatrolSubject, string> = {
  goblins: '👺',
  herd: '🐗',
  bandits: '🗡️',
  wounded: '🤕',
  pilgrim: '🧙',
  trader: '🎒',
};

type Props = {
  kind: PatrolSubject;
  tier: number;
  elite: boolean;
  /** Milliseconds before the goblins move on; null for kinds that never flee. */
  fleesIn: number | null;
  /** Just came into view: the border pulses for a few seconds. */
  fresh: boolean;
};

/** A patrol or traveller on the map, styled like a Sanctum: tier badge, elite star, goblins' flee timer. */
export function PatrolMarker({ kind, tier, elite, fleesIn, fresh }: Props) {
  const animationsEnabled = useAnimationsEnabled();
  const [pulse] = useState(() => new Animated.Value(0));
  const active = fresh && animationsEnabled;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 400, useNativeDriver: false }),
      ]),
    );
    loop.start();
    const stop = setTimeout(() => loop.stop(), 5000);
    return () => {
      clearTimeout(stop);
      loop.stop();
      pulse.setValue(0);
    };
  }, [active, pulse]);

  const borderWidth = pulse.interpolate({ inputRange: [0, 1], outputRange: [pixel.outline, pixel.outline * 2] });

  return (
    <Animated.View style={[styles.tile, elite && styles.elite, active && { borderWidth }]}>
      <Text style={styles.emoji}>{patrolIcons[kind]}</Text>
      <View style={styles.tierBadge}>
        <Text style={styles.tierText}>{tier}</Text>
      </View>
      {elite && <Text style={styles.star}>★</Text>}
      {fleesIn !== null && <Text style={styles.timer}>{Math.max(0, Math.ceil(fleesIn / 60_000))}m</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: pixel.outline,
    borderColor: colors.highlight,
    backgroundColor: colors.woodDark,
  },
  elite: { borderColor: colors.gold },
  emoji: { fontSize: 22 },
  tierBadge: {
    position: 'absolute',
    left: -6,
    top: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.woodDark,
    backgroundColor: colors.parchment,
  },
  tierText: { fontSize: 12 },
  star: { position: 'absolute', right: -4, bottom: -6, fontSize: 16, color: colors.gold },
  timer: { position: 'absolute', top: 40, alignSelf: 'center', fontSize: 13, backgroundColor: colors.parchment },
});
