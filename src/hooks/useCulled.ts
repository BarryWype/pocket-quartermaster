import { useMemo, useState } from 'react';

import { cullIds, sameIds, type Cullable } from '@/game/generation/culling';
import type { Bounds } from '@/game/generation/foliage';

/**
 * The items to draw on the map: only those inside the visible bounds plus the
 * culling margin, plus the always-drawn ids. The drawn set of ids is kept
 * stable — an update is skipped entirely when the ids don't change (checked
 * during render, as React suggests for state derived from changing props) — so
 * panning and zooming only churn the markers that actually enter or leave the
 * view, and the rest keep their places. Positions still refresh with the
 * items, so walking patrols move even while the set holds.
 */
export function useCulled<T extends Cullable>(items: T[], bounds: Bounds | null, always: string[]): T[] {
  const [ids, setIds] = useState<string[]>(() => cullIds(items, null, always));
  const next = cullIds(items, bounds, always);
  if (!sameIds(ids, next)) setIds(next);
  return useMemo(() => {
    const drawn = new Set(ids);
    return items.filter((item) => drawn.has(item.id));
  }, [items, ids]);
}
