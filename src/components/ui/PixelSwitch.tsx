import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressScale } from '@/components/motion';
import { transformTransition } from '@/components/motion/transitions';
import { useMotion } from '@/hooks/useMotion';
import { feel } from '@/services/feel';
import { colors, ui } from '@/theme';

/** How far the knob travels: the track's inside (46 - 2 × 2 border - 2 × 2 padding) less the knob. */
const TRAVEL = 46 - 4 - 4 - 16;

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** The pixel on/off switch: a square track, green when on, with a square parchment knob that slides across (Full) or jumps. */
export function PixelSwitch({ value, onValueChange, disabled, accessibilityLabel }: Props) {
  const { level } = useMotion();

  return (
    <PressScale
      haptic={false}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        feel('toggle', { on: !value });
        onValueChange(!value);
      }}
      style={[styles.wrap, disabled && styles.disabled]}
    >
      <View style={[styles.track, value && styles.trackOn]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX: value ? TRAVEL : 0 }] }, transformTransition(level)]} />
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 46, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  track: { width: 46, height: 24, padding: 2, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.woodDark },
  trackOn: { backgroundColor: ui.good },
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
