import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { GhostBody, GhostFade, type GhostVariant } from './GhostScreen';

type Props<K extends string> = {
  /** One key per page, in pager order. */
  keys: readonly K[];
  /** The page showing now. */
  active: K;
  /** What a page not yet visited shows while a swipe passes over it. */
  variant: GhostVariant;
  /** A page's real content. */
  render: (key: K) => ReactNode;
};

/**
 * A pager's pages, built only once visited: the active page and the ones seen
 * before render their content, every other page holds a ghost body, so opening
 * a screen pays for one page instead of all of them. Returns the pages as an
 * array, since a PagerView counts its direct children.
 */
export function useLazyPages<K extends string>({ keys, active, variant, render }: Props<K>): ReactNode[] {
  const [visited, setVisited] = useState<ReadonlySet<K>>(() => new Set([active]));
  if (!visited.has(active)) setVisited(new Set([...visited, active]));
  return keys.map((key) => (
    <View key={key} collapsable={false} style={styles.page}>
      {visited.has(key) || key === active ? (
        render(key)
      ) : (
        <GhostFade>
          <GhostBody variant={variant} />
        </GhostFade>
      )}
    </View>
  ));
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
