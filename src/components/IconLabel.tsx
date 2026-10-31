import type { ReactNode } from 'react';
import { StyleSheet, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { GameIcon } from './GameIcon';
import { Text } from './Text';

type Props = {
  /** The icon's emoji; its pixel art when `icon` is set. */
  emoji: string;
  /** The words next to it: a string or any inline content. */
  label: ReactNode;
  icon?: ImageSourcePropType;
  /** The icon's square size; the label keeps its own style. */
  size?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
};

/**
 * An icon or emoji beside its words, each in its own element. The game font has
 * no emoji glyphs, so a Text mixing them measures wrong and clips the label in
 * anything sized to its content — never put both in one Text (the
 * noMixedEmojiText guard test fails on it).
 */
export function IconLabel({ emoji, label, icon, size = 18, gap = 4, style, labelStyle, testID }: Props) {
  return (
    <View style={[styles.row, { gap }, style]} testID={testID}>
      <GameIcon emoji={emoji} icon={icon} size={size} />
      <Text style={labelStyle}>{label}</Text>
    </View>
  );
}

/** A line of short parts — plain words or an icon with words — that wraps whole. */
export type LabelPart = { emoji: string; text: string; after?: string } | string;

type PartsProps = {
  parts: LabelPart[];
  sep?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  size?: number;
  gap?: number;
};

/** The parts of a stats or price line: each icon beside its own words, `sep` between parts. */
export function PartsLine({ parts, sep = ' · ', style, labelStyle, size = 18, gap = 4 }: PartsProps) {
  return (
    <View style={[styles.line, style]}>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <Text key={i} style={labelStyle}>
            {i > 0 ? sep : ''}
            {part}
          </Text>
        ) : (
          <View key={i} style={styles.part}>
            <IconLabel emoji={part.emoji} label={(i > 0 ? sep : '') + part.text} size={size} gap={gap} labelStyle={labelStyle} />
            {part.after ? <GameIcon emoji={part.after} size={size} /> : null}
          </View>
        ),
      )}
    </View>
  );
}

const LEADING_EMOJI = /^(?:[\uD83C-\uD83F][\uDC00-\uDFFF]|[\u2600-\u2604\u2607-\u2712\u2717-\u2725\u2728-\u27BF\u2B00-\u2BFF\u231A-\u23FF]\uFE0F?)\s*/;

/** The emoji a loot or reward label starts with, if any: `splitLeadingEmoji('🪙 +12')` is `🪙`. */
export function splitLeadingEmoji(text: string): { emoji: string; label: string } | null {
  const match = LEADING_EMOJI.exec(text);
  if (!match) return null;
  return { emoji: match[0].trim(), label: text.slice(match[0].length) };
}

/** A loot or reward label: its leading emoji beside the words when it has one. */
export function RewardLabel({ text, size = 18, labelStyle }: { text: string; size?: number; labelStyle?: StyleProp<TextStyle> }) {
  const split = splitLeadingEmoji(text);
  if (!split) return <Text style={labelStyle}>{text}</Text>;
  return <IconLabel emoji={split.emoji} label={split.label} size={size} labelStyle={labelStyle} />;
}

/** Loot labels in one wrapping row, each leading emoji beside its own words. */
export function GainsLine({ gains, size = 18, gap = 6, style, labelStyle }: { gains: string[]; size?: number; gap?: number; style?: StyleProp<ViewStyle>; labelStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={[styles.line, { gap }, style]}>
      {gains.map((gain, i) => (
        <RewardLabel key={i} text={gain} size={size} labelStyle={labelStyle} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  part: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
