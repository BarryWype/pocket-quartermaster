import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import type { Difficulty } from '@/content/difficulty';
import type { PatrolSubject } from '@/game/patrols/generate';
import { useAnimationsEnabled } from '@/hooks/useAnimationFrame';
import { colors, difficultyTokens, pixel } from '@/theme';

import { Text } from './Text';

/** One icon per kind of patrol or traveller. */
export const patrolIcons: Record<PatrolSubject, string> = {
  goblins: '👺',
  herd: '🐗',
  bandits: '🗡️',
  wolves: '🐺',
  orcs: '👹',
  spiders: '🕷️',
  eliteGoblins: '👺',
  outlaws: '🗡️',
  ogres: '👹',
  eliteOrcs: '👹',
  trolls: '👹',
  wraiths: '👻',
  wyverns: '🐉',
  golems: '🗿',
  wounded: '🤕',
  pilgrim: '🧙',
  trader: '🎒',
};

type Props = {
  kind: PatrolSubject;
  tier: number;
  /** The patrol's difficulty band; travellers have none. */
  difficulty: Difficulty | null;
  /** Milliseconds before the goblins move on; null for kinds that never flee. */
  fleesIn: number | null;
  /** Just came into view: the border pulses for a few seconds. */
  fresh: boolean;
};

/** A patrol or traveller on the map, styled like a Sanctum: tier badge, difficulty ring and pips, goblins' flee timer. */
export function PatrolMarker({ kind, tier, difficulty, fleesIn, fresh }: Props) {
  const animationsEnabled = useAnimationsEnabled();
  const [pulse] = useState(() => new Animated.Value(0));
  const active = fresh && animationsEnabled;
  const ring = difficulty ? difficultyTokens[difficulty] : null;

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

  const borderWidth = pulse.interpolate({ inputRange: [0, 1], outputRange: [ring?.width ?? pixel.outline, (ring?.width ?? pixel.outline) * 2] });

  return (
    <Animated.View style={[styles.tile, ring && { borderColor: ring.ring, borderWidth: ring.width }, active && { borderWidth }]}>
      <Text style={styles.emoji}>{patrolIcons[kind]}</Text>
      <View style={styles.tierBadge}>
        <Text style={styles.tierText}>{tier}</Text>
      </View>
      {ring && ring.pips > 0 && (
        <Text style={styles.pips}>
          {'●'.repeat(ring.pips)}
        </Text>
      )}
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
  pips: { position: 'absolute', bottom: -7, fontSize: 8, backgroundColor: colors.parchment },
  timer: { position: 'absolute', top: 40, alignSelf: 'center', fontSize: 13, backgroundColor: colors.parchment },
});
