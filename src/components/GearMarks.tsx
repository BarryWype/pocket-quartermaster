import { StyleSheet, View } from 'react-native';

import type { Affinity } from '@/content/equipment';
import { colors } from '@/theme';

import { Text } from './Text';

/** A piece's tier badge and its ▲/▼ affinity marker for a hero (nothing when usable). */
export function GearMarks({ tier, affinity }: { tier?: number; affinity?: Affinity }) {
  return (
    <View style={styles.marks}>
      {tier ? <Text style={styles.tier}>{`T${tier}`}</Text> : null}
      {affinity === 'favoured' && <Text style={styles.favoured}>▲</Text>}
      {affinity === 'unfit' && <Text style={styles.unfit}>▼</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  marks: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tier: {
    fontSize: 13,
    color: colors.parchment,
    backgroundColor: colors.woodDark,
    paddingHorizontal: 3,
  },
  favoured: { fontSize: 16, color: colors.success },
  unfit: { fontSize: 16, color: colors.danger },
});
