import { StyleSheet, View } from 'react-native';

import { familyById, type FamilyId } from '@/content/families';
import type { Socket } from '@/game/expeditions/party';
import { ui } from '@/theme';

import { GameIcon } from './GameIcon';

/**
 * A diamond socket holding a family's icon: one per tag a place needs.
 * Plain on the list; in the party dialog dashed while empty, glowing once lit,
 * red and faded while missing.
 */
export function GemSocket({ family, state = 'plain', size = 28 }: { family: FamilyId; state?: Socket | 'plain'; size?: number }) {
  const def = familyById[family];
  return (
    <View
      style={[
        styles.socket,
        { width: size, height: size, margin: Math.round(size * 0.21) },
        state === 'plain' && styles.plain,
        state === 'lit' && styles.lit,
        state === 'empty' && styles.empty,
        state === 'missing' && styles.missing,
      ]}
    >
      <View style={[styles.icon, (state === 'empty' || state === 'missing') && styles.faded]}>
        <GameIcon emoji={def.emoji} icon={def.icon} size={Math.round(size * 0.86)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  socket: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, transform: [{ rotate: '45deg' }] },
  icon: { transform: [{ rotate: '-45deg' }] },
  faded: { opacity: 0.3 },
  plain: { backgroundColor: ui.woodDeep, borderColor: ui.brass, outlineColor: ui.outline, outlineWidth: 2, outlineStyle: 'solid' },
  lit: {
    backgroundColor: ui.woodDeep,
    borderColor: ui.brassLight,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 10, spreadDistance: 2, color: 'rgba(246,217,142,0.75)' }],
  },
  empty: { backgroundColor: ui.parchmentShade, borderColor: ui.brassDim, borderStyle: 'dashed' },
  missing: { backgroundColor: ui.badBg, borderColor: ui.bad, borderStyle: 'dashed' },
});
