import { Pressable, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { IconLabel } from '@/components/IconLabel';
import { Text } from '@/components/Text';
import { fonts, ui } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  emoji?: string;
  icon?: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
};

/** The screen's main action: an ember block with a bevel that flips while pressed. */
export function EmberButton({ title, onPress, disabled, emoji, icon, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.outline, disabled && styles.disabledOutline, style]}
    >
      {({ pressed }) => (
        <View style={[styles.face, !disabled && (pressed ? styles.pressedFace : styles.faceBevel)]}>
          {emoji !== undefined ? (
            <IconLabel
              emoji={emoji}
              icon={icon}
              label={title}
              size={30}
              labelStyle={[styles.label, disabled && styles.disabledLabel]}
            />
          ) : (
            <Text style={[styles.label, disabled && styles.disabledLabel]}>{title}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outline: { borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.ember },
  disabledOutline: { backgroundColor: ui.parchmentShade },
  face: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  faceBevel: {
    borderWidth: 3,
    borderTopColor: ui.emberLight,
    borderLeftColor: ui.emberLight,
    borderBottomColor: ui.emberDark,
    borderRightColor: ui.emberDark,
  },
  pressedFace: {
    borderWidth: 3,
    borderTopColor: ui.emberDark,
    borderLeftColor: ui.emberDark,
    borderBottomColor: ui.emberLight,
    borderRightColor: ui.emberLight,
  },
  label: { fontSize: 26, color: ui.onEmber, fontFamily: fonts.body },
  disabledLabel: { color: ui.inkMuted },
});
