import { StyleSheet, View } from 'react-native';

import type { Difficulty } from '@/content/difficulty';
import { colors, ui } from '@/theme';

import { DifficultyPips, DifficultyRing } from './ui';
import { Text } from './Text';

/** The rotated square's side: its diagonal keeps the old 44 px footprint. */
const SIDE = 31;

type Props = {
  emoji: string;
  /** No Sigil to open it with. */
  locked: boolean;
  /** A short name under the marker. */
  label?: string;
  /** A secret place from a tip: its own look, and an open lock when the player can get in. */
  secret?: boolean;
  /** The fight's difficulty band; plain places have none. */
  difficulty?: Difficulty;
  accessibilityLabel?: string;
};

/** A Sanctum or other place on the map: a diamond tile, ringed when it is a fight, greyed with a lock when locked. */
export function SanctumMarker({ emoji, locked, label, secret, difficulty, accessibilityLabel }: Props) {
  return (
    <View style={styles.marker} accessibilityLabel={accessibilityLabel}>
      <View style={styles.tileWrap}>
        {difficulty ? (
          <DifficultyRing difficulty={difficulty} shape="diamond" size={SIDE}>
            <View style={[styles.tile, locked && styles.locked]}>
              <View style={styles.upright}>
                <Text style={styles.emoji}>{emoji}</Text>
              </View>
            </View>
          </DifficultyRing>
        ) : (
          <View style={[styles.tile, styles.plain, secret && styles.secret, locked && styles.locked]}>
            <View style={styles.upright}>
              <Text style={styles.emoji}>{emoji}</Text>
            </View>
          </View>
        )}
        {locked && <Text style={styles.lock}>🔒</Text>}
        {secret && !locked && <Text style={styles.lock}>🔓</Text>}
        {difficulty && (
          <View style={styles.pips}>
            <DifficultyPips difficulty={difficulty} />
          </View>
        )}
      </View>
      {label && <Text style={[styles.label, locked && styles.lockedLabel]}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: { alignItems: 'center' },
  tileWrap: { position: 'relative' },
  tile: {
    width: SIDE,
    height: SIDE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.woodDark,
    transform: [{ rotate: '45deg' }],
  },
  plain: { borderWidth: 3, borderColor: ui.brass },
  secret: { borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: colors.ink },
  locked: { opacity: 0.55 },
  upright: { transform: [{ rotate: '-45deg' }] },
  emoji: { fontSize: 22 },
  // The diamond's right point, its mid-height corner.
  lock: { position: 'absolute', right: -6, top: '50%', marginTop: -10, fontSize: 16 },
  pips: { position: 'absolute', bottom: -8 },
  label: {
    marginTop: 2,
    paddingHorizontal: 4,
    fontSize: 14,
    color: colors.parchment,
    backgroundColor: colors.woodDark,
  },
  lockedLabel: { color: colors.muted },
});
