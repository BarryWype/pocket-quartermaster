import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { PressScale } from '@/components/motion';

import { GameIcon } from '@/components/GameIcon';
import { Text } from '@/components/Text';
import { fonts, ui } from '@/theme';

type Props = {
  label: string;
  emoji?: string;
  icon?: ImageSourcePropType;
  selected?: boolean;
  badge?: number | string;
  /** The rotated square's side; its diagonal is ~1.42 times this. */
  size?: number;
  showLabel?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

/** A rail item: a rotated wood square with its icon counter-rotated and a label below. */
export function DiamondButton({ label, emoji, icon, selected, badge, size = 52, showLabel = true, disabled, onPress, accessibilityLabel }: Props) {
  const iconSize = Math.round(size * 0.6);
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.item, disabled && styles.itemDisabled]}
      hitSlop={size < 44 ? 6 : undefined}
    >
      {({ pressed }) => {
        // Lit on press-in, in the same frame, so a tap shows it registered before anything opens.
        const lit = selected || pressed;
        return (
          <>
            <View style={[styles.box, { width: size, height: size, marginHorizontal: size * 0.21, marginVertical: size * 0.21 }]}>
              <View style={[styles.frame, lit && styles.frameSelected]}>
                <View style={[styles.face, lit ? styles.faceSelected : styles.faceIdle]}>
                  <View style={[styles.inner, { borderColor: lit ? ui.brassLight : ui.brassDim }]} pointerEvents="none" />
                  {(emoji !== undefined || icon !== undefined) && (
                    <View style={styles.iconSpin}>
                      <GameIcon emoji={emoji ?? ''} icon={icon} size={iconSize} />
                    </View>
                  )}
                </View>
              </View>
              {badge !== undefined && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </View>
            {showLabel && <Text style={[styles.label, lit && styles.labelSelected]}>{label}</Text>}
          </>
        );
      }}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: 'center' },
  itemDisabled: { opacity: 0.4 },
  box: { position: 'relative' },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: 'transparent', transform: [{ rotate: '45deg' }] },
  frameSelected: { borderColor: ui.brass },
  face: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: ui.outline },
  faceSelected: { backgroundColor: ui.woodSelected },
  faceIdle: { backgroundColor: ui.woodDark },
  inner: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderWidth: 2 },
  iconSpin: { transform: [{ rotate: '-45deg' }] },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    paddingHorizontal: 1,
    paddingVertical: 0,
    alignItems: 'center',
    backgroundColor: ui.ember,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  badgeText: { fontFamily: fonts.serifBold, fontSize: 11, color: ui.onEmber },
  label: { fontSize: 15, color: ui.onWoodMuted, textAlign: 'center' },
  labelSelected: { color: ui.brassLight },
});
