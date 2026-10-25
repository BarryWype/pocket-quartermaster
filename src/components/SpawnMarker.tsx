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
  /** Needs a better pickaxe than the player has. */
  locked: boolean;
};

export function SpawnMarker({ emoji, kind, inRange, fleeing, locked }: Props) {
  return (
    <View
      style={[
        styles.tile,
        { borderColor: borderColors[kind] },
        inRange && styles.inRange,
        (fleeing || locked) && styles.faded,
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
  faded: { opacity: 0.6 },
  emoji: { fontSize: 16 },
});
