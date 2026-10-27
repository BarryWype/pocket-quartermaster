import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';

import { colors, fonts } from '@/theme';

/** `Text` with the game font. */
export function Text({ style, ...props }: TextProps) {
  return <NativeText style={[styles.text, style]} {...props} />;
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.body, fontSize: 18, color: colors.ink },
});
