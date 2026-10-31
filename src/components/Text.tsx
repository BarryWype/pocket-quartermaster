import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';

import { colors, fonts } from '@/theme';

/** Emoji the game font has no glyphs for, so a run mixing them with words measures wrong. */
const EMOJI = /[\uD83C-\uD83F][\uDC00-\uDFFF]|[\u2600-\u2604\u2607-\u2712\u2717-\u2725\u2728-\u27BF\u2B00-\u2BFF\u231A-\u23FF]\uFE0F?|\uFE0F/;
const WORDS = /[A-Za-zÀ-ÿ]/;

/** Strings already warned about in this session, so each mixed line logs once. */
const warned = new Set<string>();

/**
 * `Text` with the game font. In development it warns when its string children
 * mix an emoji with words: the font has no emoji glyphs, so the run measures
 * wrong and clips in anything sized to its content. Put the emoji in its own
 * element (IconLabel) instead.
 */
export function Text({ style, children, ...props }: TextProps) {
  if (__DEV__ && typeof children === 'string' && EMOJI.test(children) && WORDS.test(children) && !warned.has(children)) {
    warned.add(children);
    console.warn(
      `[Text] mixes an emoji with words, which the game font cannot measure: "${children.slice(0, 40)}${children.length > 40 ? '…' : ''}" — put the emoji in its own element (IconLabel)`,
    );
  }
  return <NativeText style={[styles.text, style]} {...props}>{children}</NativeText>;
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.body, fontSize: 18, color: colors.ink },
});
