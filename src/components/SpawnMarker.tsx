import { StyleSheet, View } from 'react-native';

import type { ResourceKind } from '@/game/generation/types';

import { Text } from './Text';

const borderColors: Record<ResourceKind, string> = {
  ore: '#6b6b6b',
  animal: '#8a5a2b',
  herb: '#2f6b2a',
  rare: '#c99a00',
};

type Props = {
  emoji: string;
  kind: ResourceKind;
  inRange: boolean;
  fleeing: boolean;
};

export function SpawnMarker({ emoji, kind, inRange, fleeing }: Props) {
  return (
    <View
      style={[
        styles.tile,
        { borderColor: borderColors[kind] },
        inRange && styles.inRange,
        fleeing && styles.fleeing,
      ]}
    >
      <Text style={styles.emoji}>{fleeing ? '💨' : emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4ead2',
    borderWidth: 3,
  },
  inRange: { backgroundColor: '#fff6a8', transform: [{ scale: 1.2 }] },
  fleeing: { opacity: 0.6 },
  emoji: { fontSize: 16 },
});
