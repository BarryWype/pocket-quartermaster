import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { ui } from '@/theme';

import { DiamondButton } from './DiamondButton';

export const RAIL_WIDTH = 74;

export type RailItem = {
  key: string;
  label: string;
  emoji?: string;
  icon?: ImageSourcePropType;
  badge?: number | string;
};

type Props = {
  items: RailItem[];
  selected: string;
  onSelect: (key: string) => void;
};

/** The left section rail: diamond buttons on a deep-wood column with an outline right edge. */
export function DiamondRail({ items, selected, onSelect }: Props) {
  return (
    <View style={styles.rail}>
      <View style={styles.innerLine} pointerEvents="none" />
      {items.map((item) => (
        <DiamondButton
          key={item.key}
          label={item.label}
          emoji={item.emoji}
          icon={item.icon}
          badge={item.badge}
          selected={item.key === selected}
          onPress={() => onSelect(item.key)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: ui.woodDeep,
    borderRightWidth: 3,
    borderRightColor: ui.outline,
    alignItems: 'center',
    paddingTop: 18,
    gap: 10,
  },
  innerLine: { position: 'absolute', top: 0, bottom: 0, right: 3, width: 2, backgroundColor: ui.woodMid },
});
