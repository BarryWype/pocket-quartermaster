import { Pressable, StyleSheet, View } from 'react-native';

import { colors, pixel } from '@/theme';

import { Text } from './Text';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
};

/** A pixel-art button: square, outlined, bevelled; the bevel flips while pressed. */
export function Button({ title, onPress, disabled, color = colors.wood }: Props) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.outline, disabled && styles.disabled]}>
      {({ pressed }) => (
        <View style={[styles.face, { backgroundColor: color }, pressed && styles.pressed]}>
          <Text style={styles.label}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outline: { borderWidth: pixel.outline, borderColor: colors.ink, backgroundColor: colors.ink },
  face: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: 'center',
    borderWidth: pixel.bevel,
    borderTopColor: colors.bevelLight,
    borderLeftColor: colors.bevelLight,
    borderBottomColor: colors.bevelDark,
    borderRightColor: colors.bevelDark,
  },
  pressed: {
    borderTopColor: colors.bevelDark,
    borderLeftColor: colors.bevelDark,
    borderBottomColor: colors.bevelLight,
    borderRightColor: colors.bevelLight,
    transform: [{ translateY: 1 }],
  },
  disabled: { opacity: 0.4 },
  label: { color: colors.parchment, fontSize: 19, textShadowColor: colors.bevelDark, textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
});
