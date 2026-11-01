import { useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

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

/** A tab strip over a swipable pager; the active tab is parchment and joins the page area. */
export function SwipeTabs({ tabs, children, initialPage = 0, onPageChange, variant = 'cards' }: Props) {
  const [index, setIndex] = useState(initialPage);
  const pager = useRef<PagerView>(null);
  const pages = useLazyPages({
    keys: tabs.map(({ key }) => key),
    active: tabs[index].key,
    variant,
    render: (key) => children[tabs.findIndex((tab) => tab.key === key)],
  });
  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {tabs.map((tab, i) => (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            onPress={() => pager.current?.setPage(i)}
            style={[styles.tab, i === index && styles.tabActive]}
          >
            <Text style={[styles.tabLabel, i === index && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
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
  tabLabel: { fontSize: 18, color: ui.onWoodMuted },
  tabLabelActive: { color: ui.ink, fontFamily: fonts.body },
  pages: { flex: 1, borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.parchment },
  pager: { flex: 1 },
});
