import { StyleSheet, View } from 'react-native';

import { valuableById } from '@/content/lookup';
import { t, tr } from '@/i18n';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { PriceTag } from './PriceTag';
import { Text } from './Text';

type Props = {
  valuables: Record<string, number>;
  /** Price per unit of a `valuableId:tier` stack at this buyer. */
  price: (key: string) => number;
  canSell: (key: string, count: number) => boolean;
  onSell: (key: string, count: number) => void;
  /** The market collector's kind, marked on its rows. */
  wanted?: string | null;
};

/** The valuables a buyer takes: one row per stack with its price, sell one or all. */
export function ValuableRows({ valuables, price, canSell, onSell, wanted }: Props) {
  const held = Object.entries(valuables).filter(([key, count]) => count > 0 && valuableById[key.split(':')[0]]);
  return held.map(([key, count]) => {
    const [id, tier] = key.split(':');
    const def = valuableById[id];
    return (
      <View key={key} style={styles.row}>
        <Text style={[styles.name, id === wanted && styles.wanted]}>
          {def.emoji} {t('inventory.valuable', { name: tr(def.name), tier })} ×{count}
          {id === wanted ? ` · ${t('places.collectorWants')}` : ''}
        </Text>
        <View style={styles.actions}>
          <PriceTag price={price(key)} style={styles.name} />
          <Button title={t('places.sell')} disabled={!canSell(key, 1)} onPress={() => onSell(key, 1)} />
          <Button title={t('places.sellAll')} disabled={!canSell(key, count)} onPress={() => onSell(key, count)} />
        </View>
      </View>
    );
  });
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 8, borderTopWidth: pixel.outline, borderTopColor: colors.parchmentDark },
  name: { fontSize: 21 },
  wanted: { color: colors.success },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
