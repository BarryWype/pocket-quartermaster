import type { ReactNode } from 'react';
import { StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/Text';
import { fonts, ui } from '@/theme';

import { EmberButton } from './EmberButton';
import { ItemSlot } from './ItemSlot';
import { ParchmentCard } from './ParchmentCard';
import { WoodButton } from './WoodButton';

export type PopupLine = { tone: 'keyword' | 'good' | 'bad' | 'muted'; text: string; detail?: string };
export type PopupIngredient = {
  key: string;
  label: string;
  emoji: string;
  icon?: ImageSourcePropType;
  have: number;
  need: number;
};

type Props = {
  title: string;
  /** The title band's second line; takes a node so a countdown can tick inside it. */
  subtitle?: ReactNode;
  emoji: string;
  icon?: ImageSourcePropType;
  value?: string | number;
  valueLabel?: string;
  note?: string;
  lines?: PopupLine[];
  /** Extra content, shown after the lines. */
  children?: ReactNode;
  ingredients?: PopupIngredient[];
  action?: { title: string; onPress: () => void; disabled?: boolean; emoji?: string; icon?: ImageSourcePropType };
  secondary?: { title: string; onPress: () => void; disabled?: boolean };
  /** A pointer sticking out of the card's top or bottom edge, at `x` px from its left. */
  pointer?: { side: 'top' | 'bottom'; x: number };
  style?: StyleProp<ViewStyle>;
};

/** One keyword, class or muted line of a pop-up. */
function Line({ line }: { line: PopupLine }) {
  if (line.tone === 'keyword')
    return (
      <View style={styles.line}>
        <Text style={styles.keyword}>{line.text}</Text>
        {line.detail !== undefined && <Text style={styles.keywordDetail}>— {line.detail}</Text>}
      </View>
    );
  const mark = line.tone === 'good' ? '▲' : line.tone === 'bad' ? '▼' : undefined;
  return (
    <View style={styles.line}>
      {mark !== undefined && <Text style={[styles.lineText, line.tone === 'good' ? styles.good : styles.bad]}>{mark}</Text>}
      <Text style={[styles.lineText, line.tone === 'muted' ? styles.muted : line.tone === 'good' ? styles.good : styles.bad]}>{line.text}</Text>
    </View>
  );
}

/** The selected item's pop-up: parchment card with value, lines, ingredients and the main action. */
export function ItemPopup({ title, subtitle, emoji, icon, value, valueLabel, note, lines, children, ingredients, action, secondary, pointer, style }: Props) {
  return (
    <View style={style}>
      {pointer?.side === 'top' && (
        <View style={[styles.pointer, styles.pointerTop, { left: pointer.x - 9 }]} pointerEvents="none" />
      )}
      <ParchmentCard title={title} titleEmoji={emoji} titleIcon={icon} titleSub={subtitle} contentStyle={styles.content}>
        {(value !== undefined || note !== undefined) && (
          <View style={styles.center}>
            {value !== undefined && (
              <View style={styles.valueRow}>
                <Text style={styles.value}>{value}</Text>
                {valueLabel !== undefined && <Text style={styles.valueLabel}>{valueLabel}</Text>}
              </View>
            )}
            {note !== undefined && <Text style={styles.note}>{note}</Text>}
          </View>
        )}
        {lines?.map((line, i) => (
          <Line key={i} line={line} />
        ))}
        {children}
        {ingredients !== undefined && ingredients.length > 0 && (
          <View style={styles.rule}>
            <View style={styles.ingredients}>
              {ingredients.map((ingredient) => (
                <ItemSlot
                  key={ingredient.key}
                  state={ingredient.have >= ingredient.need ? 'ready' : 'short'}
                  emoji={ingredient.emoji}
                  icon={ingredient.icon}
                  count={`${ingredient.have}/${ingredient.need}`}
                  size={54}
                  accessibilityLabel={ingredient.label}
                />
              ))}
            </View>
          </View>
        )}
        {action && (
          <EmberButton style={styles.action} title={action.title} onPress={action.onPress} disabled={action.disabled} emoji={action.emoji} icon={action.icon} />
        )}
        {secondary && (
          <View style={styles.secondary}>
            <WoodButton title={secondary.title} onPress={secondary.onPress} disabled={secondary.disabled} />
          </View>
        )}
      </ParchmentCard>
      {pointer?.side === 'bottom' && (
        <View style={[styles.pointer, styles.pointerBottom, { left: pointer.x - 9 }]} pointerEvents="none" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pointer: {
    position: 'absolute',
    width: 18,
    height: 18,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  pointerTop: { top: -9, backgroundColor: ui.woodMid, borderTopWidth: 3, borderLeftWidth: 3, borderTopColor: ui.outline, borderLeftColor: ui.outline },
  pointerBottom: { bottom: -9, backgroundColor: ui.parchment, borderBottomWidth: 3, borderRightWidth: 3, borderBottomColor: ui.outline, borderRightColor: ui.outline },
  content: { alignItems: 'center', gap: 3, paddingVertical: 10, paddingHorizontal: 14 },
  center: { alignItems: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  value: { fontFamily: fonts.serifBold, fontSize: 26, color: ui.ink },
  valueLabel: { fontFamily: fonts.serif, fontSize: 15, color: ui.inkMuted },
  note: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 4 },
  lineText: { fontFamily: fonts.serif, fontSize: 15 },
  keyword: { fontFamily: fonts.serifBold, fontSize: 15, color: ui.keyword },
  keywordDetail: { fontFamily: fonts.serif, fontSize: 15, color: '#4A5E80' },
  good: { color: ui.good },
  bad: { color: ui.bad },
  muted: { color: ui.inkMuted },
  rule: { borderTopWidth: 2, borderTopColor: ui.parchmentRule, borderStyle: 'dashed', paddingVertical: 8, alignSelf: 'stretch' },
  ingredients: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  action: { alignSelf: 'stretch', marginHorizontal: 0 },
  secondary: { alignSelf: 'stretch' },
});
