import { StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { PressScale } from '@/components/motion';

import { IconLabel } from '@/components/IconLabel';
import { Text } from '@/components/Text';
import { fonts, ui } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  emoji?: string;
  icon?: ImageSourcePropType;
  /** A smaller block for in-card actions. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The secondary button: a wood block with a brass inner outline. */
export function WoodButton({ title, onPress, disabled, emoji, icon, compact, style }: Props) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.outline, disabled && styles.disabled, style]}
    >
      <View style={[styles.face, compact && styles.compactFace]}>
        <View style={styles.rim} pointerEvents="none" />
        {emoji !== undefined ? (
          <IconLabel emoji={emoji} icon={icon} label={title} labelStyle={[styles.label, compact && styles.compactLabel]} />
        ) : (
          <Text style={[styles.label, compact && styles.compactLabel]}>{title}</Text>
        )}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  outline: { borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.woodMid },
  disabled: { opacity: 0.5 },
  face: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  compactFace: { minHeight: 44, paddingHorizontal: 12 },
  rim: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 2, borderColor: ui.brass },
  label: { fontSize: 22, color: ui.brassLight, fontFamily: fonts.body },
  compactLabel: { fontSize: 18 },
});
