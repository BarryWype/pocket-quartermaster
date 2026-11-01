import { Pressable, StyleSheet, View } from 'react-native';

import { colors, ui } from '@/theme';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** The pixel on/off switch: a square track, green when on, with a square parchment knob. */
export function PixelSwitch({ value, onValueChange, disabled, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[styles.wrap, disabled && styles.disabled]}
    >
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={styles.knob} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 46, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  track: { width: 46, height: 24, padding: 2, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.woodDark },
  trackOn: { justifyContent: 'flex-end', backgroundColor: ui.good },
  knob: {
    width: 16,
    height: 16,
    backgroundColor: ui.parchment,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopColor: colors.bevelLight,
    borderLeftColor: colors.bevelLight,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomColor: colors.bevelDark,
    borderRightColor: colors.bevelDark,
  },
});
