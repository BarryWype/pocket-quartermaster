import { Pressable, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { EquippedBadge } from '@/components/EquippedBadge';
import { FamilyTags } from '@/components/FamilyTag';
import { GameIcon } from '@/components/GameIcon';
import { Text } from '@/components/Text';
import type { FamilyId } from '@/content/families';
import { gearRules } from '@/content/gear';
import { fonts, ui } from '@/theme';

export type SlotState = 'selected' | 'ready' | 'short' | 'empty' | 'locked';

type Props = {
  state: SlotState;
  emoji?: string;
  icon?: ImageSourcePropType;
  count?: number | string;
  mark?: 'up' | 'down';
  size?: number;
  /** A "maybe" reward: dashed brass-dim border and a half-faded icon. */
  faded?: boolean;
  /** A hero is wearing this piece: a shield badge on the corner. */
  equipped?: boolean;
  /** A Legendary piece: a gold frame around the socket. */
  legendary?: boolean;
  /** A piece's family tags, small in the socket's bottom-left corner. */
  families?: { family: FamilyId; count: number }[];
  onPress?: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/** A square item socket: selected, ready, short, empty or locked. */
export function ItemSlot({ state, emoji, icon, count, mark, size, faded, equipped, legendary, families, onPress, accessibilityLabel, style }: Props) {
  const filled = state === 'selected' || state === 'ready' || state === 'short';
  const shown = state === 'locked' ? '🔒' : state === 'empty' ? undefined : emoji;
  const face = (
    <View
      style={[
        styles.slot,
        size !== undefined ? { width: size, height: size } : styles.fill,
        state === 'selected' && styles.selected,
        legendary && { borderColor: gearRules.colors.legendary },
        (state === 'empty' || state === 'locked') && styles.emptyish,
        faded && styles.faded,
        style,
      ]}
    >
      {filled && <View style={styles.innerShadow} pointerEvents="none" />}
      {filled && (
        <View
          style={[
            styles.innerOutline,
            state === 'selected' ? styles.selectedOutline : state === 'ready' ? styles.readyOutline : styles.shortOutline,
          ]}
          pointerEvents="none"
        />
      )}
      {shown !== undefined && (
        <View style={[styles.icon, state === 'short' && styles.iconShort, state === 'locked' && styles.iconLocked, faded && styles.iconFaded]}>
          <GameIcon emoji={shown} icon={icon} size={size !== undefined ? Math.round(size * 0.6) : 36} />
        </View>
      )}
      {state === 'short' && <View style={styles.shortMark} pointerEvents="none" />}
      {count !== undefined && <Text style={styles.count}>{count}</Text>}
      {mark !== undefined && <Text style={[styles.mark, mark === 'up' ? styles.markUp : styles.markDown]}>{mark === 'up' ? '▲' : '▼'}</Text>}
      {families && (
        <FamilyTags tags={families} named={false} sheet={false} size={Math.round((size ?? 60) * 0.24)} style={styles.families} />
      )}
      {equipped && <EquippedBadge size={size ?? 60} />}
    </View>
  );
  const ring = [styles.ring, state === 'selected' && styles.ringSelected];
  if (!onPress) return <View style={ring}>{face}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={ring}
    >
      {face}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDeep,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  fill: { aspectRatio: 1, minHeight: 60 },
  selected: { backgroundColor: ui.woodSelected },
  emptyish: { borderStyle: 'dashed', borderColor: ui.woodSeam },
  faded: { borderStyle: 'dashed', borderColor: ui.brassDim },
  iconShort: { opacity: 0.55 },
  iconLocked: { opacity: 0.5 },
  iconFaded: { opacity: 0.5 },
  innerShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopColor: '#160C06',
    borderLeftColor: '#160C06',
  },
  innerOutline: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderWidth: 2 },
  selectedOutline: { borderColor: ui.brassLight },
  readyOutline: { borderColor: ui.brassDim },
  shortOutline: { borderColor: ui.woodSeam },
  icon: {},
  ring: { borderWidth: 2, borderColor: 'transparent' },
  ringSelected: { borderColor: ui.brass },
  shortMark: { position: 'absolute', top: 2, right: 2, width: 10, height: 10, backgroundColor: ui.ember, borderWidth: 2, borderColor: ui.outline },
  count: {
    position: 'absolute',
    right: 3,
    bottom: 1,
    fontFamily: fonts.serifBold,
    fontSize: 13,
    color: ui.onWood,
    textShadowColor: ui.outline,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  mark: { position: 'absolute', top: 1, left: 2, fontSize: 12 },
  families: { position: 'absolute', left: 3, bottom: 3, gap: 2 },
  markUp: { color: '#7FC46A' },
  markDown: { color: '#E0704E' },
});
