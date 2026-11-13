import { useState } from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated from 'react-native-reanimated';

import { transformTransition } from '@/components/motion/transitions';
import { useMotion } from '@/hooks/useMotion';
import { ui } from '@/theme';

import { DiamondButton } from './DiamondButton';

export const RAIL_WIDTH = 74;

export type RailItem = {
  key: string;
  label: string;
  emoji?: string;
  icon?: ImageSourcePropType;
  badge?: number | string;
  /** Set apart from the items above with a little extra top margin. */
  spaced?: boolean;
};

type Props = {
  items: RailItem[];
  selected: string;
  onSelect: (key: string) => void;
};

/**
 * The left section rail: diamond buttons on a deep-wood column with an outline
 * right edge, and a brass marker on that edge beside the selected one, which
 * slides to the next pick (a native transition, Full only).
 */
export function DiamondRail({ items, selected, onSelect }: Props) {
  const [places, setPlaces] = useState<Record<string, { y: number; height: number }>>({});
  const place = places[selected];
  const { level } = useMotion();
  return (
    <View style={styles.rail}>
      <View style={styles.innerLine} pointerEvents="none" />
      {place && (
        <Animated.View
          style={[styles.marker, { height: place.height, transform: [{ translateY: place.y }] }, transformTransition(level)]}
          pointerEvents="none"
        />
      )}
      {items.map((item) => (
        <View
          key={item.key}
          style={item.spaced && styles.spaced}
          onLayout={({ nativeEvent: { layout } }) =>
            setPlaces((known) =>
              known[item.key]?.y === layout.y && known[item.key]?.height === layout.height ? known : { ...known, [item.key]: { y: layout.y, height: layout.height } },
            )
          }
        >
          <DiamondButton
            label={item.label}
            emoji={item.emoji}
            icon={item.icon}
            badge={item.badge}
            selected={item.key === selected}
            onPress={() => onSelect(item.key)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  spaced: { marginTop: 12 },
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
  marker: { position: 'absolute', top: 0, right: 1, width: 4, backgroundColor: ui.brass },
});
