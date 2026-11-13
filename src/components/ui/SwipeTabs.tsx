import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import PagerView from 'react-native-pager-view';
import Animated from 'react-native-reanimated';

import { PressScale } from '@/components/motion';
import { transformTransition } from '@/components/motion/transitions';
import { useMotion } from '@/hooks/useMotion';

import { Text } from '@/components/Text';
import { fonts, ui } from '@/theme';

import { type GhostVariant } from './GhostScreen';
import { useLazyPages } from './LazyPages';

type Props = {
  tabs: { key: string; label: string }[];
  /** One page per tab, in tab order. */
  children: ReactNode[];
  initialPage?: number;
  onPageChange?: (index: number) => void;
  variant?: GhostVariant;
};

/**
 * A tab strip over a swipable pager; the active tab is parchment and joins the
 * page area. Once the strip's width is known, the wood tabs are drawn behind
 * and the parchment face slides over them to the next tab (a native transition, Full only), under
 * the labels; until then the active tab draws its own.
 */
export function SwipeTabs({ tabs, children, initialPage = 0, onPageChange, variant = 'cards' }: Props) {
  const [index, setIndex] = useState(initialPage);
  const [width, setWidth] = useState(0);
  const pager = useRef<PagerView>(null);
  const tabWidth = width / tabs.length;
  const { level } = useMotion();
  const pages = useLazyPages({
    keys: tabs.map(({ key }) => key),
    active: tabs[index].key,
    variant,
    render: (key) => children[tabs.findIndex((tab) => tab.key === key)],
  });
  return (
    <View style={styles.wrap}>
      <View style={styles.tabs} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
        {width > 0 && (
          <>
            <View style={styles.under} pointerEvents="none">
              {tabs.map((tab) => (
                <View key={tab.key} style={styles.tab} />
              ))}
            </View>
            <Animated.View
              style={[styles.tab, styles.tabActive, styles.face, { width: tabWidth, transform: [{ translateX: index * tabWidth }] }, transformTransition(level)]}
              pointerEvents="none"
            />
          </>
        )}
        {tabs.map((tab, i) => (
          <PressScale
            key={tab.key}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            onPress={() => pager.current?.setPage(i)}
            style={[styles.tab, width > 0 ? styles.tabClear : i === index && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, i === index && styles.tabLabelActive]}>{tab.label}</Text>
          </PressScale>
        ))}
      </View>
      <View style={styles.pages}>
        <PagerView
          ref={pager}
          style={styles.pager}
          initialPage={initialPage}
          onPageSelected={({ nativeEvent }) => {
            setIndex(nativeEvent.position);
            onPageChange?.(nativeEvent.position);
          }}
        >
          {pages}
        </PagerView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  tabs: { flexDirection: 'row', marginBottom: -3, zIndex: 1 },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 3,
    borderColor: ui.outline,
    backgroundColor: ui.woodSeam,
    minHeight: 44,
  },
  tabActive: { backgroundColor: ui.parchment, borderBottomColor: ui.parchment },
  /** Once the strip is measured: the wood tabs behind, the parchment face sliding over them, the labels on top. */
  under: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  face: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  tabClear: { backgroundColor: 'transparent', borderColor: 'transparent' },
  tabLabel: { fontSize: 18, color: ui.onWoodMuted },
  tabLabelActive: { color: ui.ink, fontFamily: fonts.body },
  pages: { flex: 1, borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.parchment },
  pager: { flex: 1 },
});
