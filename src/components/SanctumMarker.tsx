import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Text } from './Text';

type Props = {
  emoji: string;
  /** No Sigil to open it with. */
  locked: boolean;
};

/** A Sanctum on the map: larger than resources, greyed with a lock when the player can't open it. */
export function SanctumMarker({ emoji, locked }: Props) {
  return (
    <View style={[styles.tile, locked && styles.locked]}>
      <Text style={styles.emoji}>{emoji}</Text>
      {locked && <Text style={styles.lock}>🔒</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.highlight,
    backgroundColor: colors.woodDark,
  },
  locked: { opacity: 0.55, borderColor: colors.muted },
  emoji: { fontSize: 22 },
  lock: { position: 'absolute', right: -6, bottom: -6, fontSize: 16 },
});
