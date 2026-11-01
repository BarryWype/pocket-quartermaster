import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import type { Difficulty } from '@/content/difficulty';
import type { PatrolSubject } from '@/game/patrols/generate';
import { useAnimationsEnabled } from '@/hooks/useAnimationFrame';
import { colors, difficultyTokens, pixel } from '@/theme';

import { DifficultyPips, DifficultyRing } from './ui';
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

/** The rotated square's side: its diagonal keeps the old 44 px footprint. */
const SIDE = 31;

type Props = {
  kind: PatrolSubject;
  /** The patrol's difficulty band; travellers have none. */
  difficulty: Difficulty | null;
  /** Milliseconds before the goblins move on; null for kinds that never flee. */
  fleesIn: number | null;
  /** Just came into view: the difficulty ring pulses for a few seconds. */
  fresh: boolean;
  accessibilityLabel?: string;
};

/** A patrol or traveller on the map: a diamond tile with the difficulty ring and pips, and the goblins' flee timer. */
export function PatrolMarker({ kind, difficulty, fleesIn, fresh, accessibilityLabel }: Props) {
  const animationsEnabled = useAnimationsEnabled();
  const [pulse] = useState(() => new Animated.Value(0));
  const active = fresh && animationsEnabled && difficulty !== null;

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

  // The fresh pulse breathes the ring's width, from its base width to double.
  const base = difficulty ? difficultyTokens[difficulty].width : pixel.outline;
  const ringWidth = pulse.interpolate({ inputRange: [0, 1], outputRange: [base, base * 2] });

  const tile = (
    <View style={[styles.tile, difficulty === null && styles.plain]}>
      <View style={styles.upright}>
        <Text style={styles.emoji}>{patrolIcons[kind]}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.marker} accessibilityLabel={accessibilityLabel}>
      {difficulty ? (
        <DifficultyRing difficulty={difficulty} shape="diamond" size={SIDE} ringWidth={active ? ringWidth : undefined}>
          {tile}
        </DifficultyRing>
      ) : (
        tile
      )}
      {difficulty && (
        <View style={styles.pips}>
          <DifficultyPips difficulty={difficulty} />
        </View>
      )}
      {fleesIn !== null && <Text style={styles.timer}>{Math.max(0, Math.ceil(fleesIn / 60_000))}m</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: { alignItems: 'center' },
  tile: {
    width: SIDE,
    height: SIDE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.woodDark,
    transform: [{ rotate: '45deg' }],
  },
  plain: { borderWidth: pixel.outline, borderColor: colors.highlight },
  upright: { transform: [{ rotate: '-45deg' }] },
  emoji: { fontSize: 22 },
  pips: { position: 'absolute', bottom: -8 },
  timer: { position: 'absolute', bottom: -26, alignSelf: 'center', fontSize: 13, backgroundColor: colors.parchment },
});
