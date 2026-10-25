import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';

import { Text } from './Text';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
};

/** Replaces the platform `Button`, whose label can't use the game font. */
export function Button({ title, onPress, disabled, color = colors.wood }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: color },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.woodDark,
    alignItems: 'center',
  },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  label: { color: colors.parchment, fontSize: 15 },
});
