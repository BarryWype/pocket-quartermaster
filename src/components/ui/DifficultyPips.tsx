import { StyleSheet, View } from 'react-native';

import { GameIcon } from '@/components/GameIcon';
import type { Difficulty } from '@/content/difficulty';
import { difficultyTokens, ui } from '@/theme';

/**
 * The difficulty's pips: one to three brass diamonds, or the boss's crown —
 * the same signal as the ring colour, for colour-blind players.
 */
export function DifficultyPips({ difficulty }: { difficulty: Difficulty }) {
  const token = difficultyTokens[difficulty];
  if (!token.pips) return <GameIcon emoji="👑" size={14} />;
  return (
    <View style={styles.row}>
      {Array.from({ length: token.pips }, (_, i) => (
        <View key={i} style={styles.pip} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3 },
  pip: {
    width: 6,
    height: 6,
    backgroundColor: ui.brass,
    borderWidth: 1,
    borderColor: ui.outline,
    transform: [{ rotate: '45deg' }],
  },
});
