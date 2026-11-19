import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { StockLine } from '@/game/places/shops';
import { t } from '@/i18n';
import { ui } from '@/theme';

import { Text } from '../Text';
import { ItemSlot } from '../ui';
import { stockLook } from './placeText';

const MINI = 30;
const MOST = 6;

type Props = {
  /** What the place does, in one line. */
  line: string;
  /** What it sells, as small tiles after the line. */
  stock?: StockLine[];
  /** A line under it: "walk here to discover it", a heist under way. */
  note?: ReactNode;
  /** The last dig's or catch's finds. */
  children?: ReactNode;
};

/** The peek's one line: what the place does, with what it sells as small tiles. */
export function PlaceSummary({ line, stock, note, children }: Props) {
  const shown = stock?.slice(0, MOST) ?? [];
  const more = (stock?.length ?? 0) - shown.length;
  return (
    <View style={styles.wrap}>
      <Text style={styles.line}>{line}</Text>
      {shown.length > 0 && (
        <View style={styles.tiles} accessibilityLabel={t('placeSheet.forSale', { count: stock!.length })}>
          {shown.map((entry) => {
            const look = stockLook(entry);
            return <ItemSlot key={entry.key} state="ready" size={MINI} emoji={look.emoji} icon={look.icon} frame={look.frame} accessibilityLabel={look.name} />;
          })}
          {more > 0 && <Text style={styles.more}>{t('tiles.more', { count: more })}</Text>}
        </View>
      )}
      {note}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  line: { fontSize: 19, color: ui.ink },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  more: { fontSize: 14, color: ui.inkMuted },
});
