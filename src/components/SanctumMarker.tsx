import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Text } from './Text';

type Props = {
  emoji: string;
  /** No Sigil to open it with. */
  locked: boolean;
  /** A short name under the marker. */
  label?: string;
  /** A secret place from a tip: its own look, and an open lock when the player can get in. */
  secret?: boolean;
};

/** A Sanctum or other place on the map: larger than resources, greyed with a lock when the player can't use it. */
export function SanctumMarker({ emoji, locked, label, secret }: Props) {
  return (
    <View style={styles.marker}>
      <View style={[styles.tile, secret && styles.secret, locked && styles.locked]}>
        <Text style={styles.emoji}>{emoji}</Text>
        {locked && <Text style={styles.lock}>🔒</Text>}
        {secret && !locked && <Text style={styles.lock}>🔓</Text>}
      </View>
      {label && <Text style={[styles.label, locked && styles.lockedLabel]}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: { alignItems: 'center' },
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
  secret: { borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: colors.ink },
  locked: { opacity: 0.55, borderColor: colors.muted },
  emoji: { fontSize: 22 },
  lock: { position: 'absolute', right: -6, bottom: -6, fontSize: 16 },
  label: {
    marginTop: 2,
    paddingHorizontal: 4,
    fontSize: 14,
    color: colors.parchment,
    backgroundColor: colors.woodDark,
  },
  lockedLabel: { color: colors.muted },
});
