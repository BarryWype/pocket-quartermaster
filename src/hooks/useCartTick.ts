import { useEffect } from 'react';

import { frPatrolTexts } from '@/content/fr/patrols';
import { materialById } from '@/content/lookup';
import { patrolTexts } from '@/content/patrols';
import type { PatrolKind } from '@/game/patrols/generate';
import { cartNextEventAt } from '@/game/supply/cart';
import { orderPlaceName } from '@/game/supply/orders';
import { raidNextEventAt } from '@/game/supply/raids';
import type { CartPlaceLine, CartLogLine, RaidLogLine } from '@/game/supply/types';
import { tavernNameOf } from '@/game/taverns/taverns';
import type { SaveData } from '@/game/save';
import { localized, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

import { useSupplyOn } from './useSupply';

const MIN_DELAY_MS = 1000;
/** A due event further off than this is waited for in steps, so a clock change can't strand it. */
const MAX_DELAY_MS = 10 * 60_000;

const kindName = (kind: PatrolKind) => localized({ en: patrolTexts, fr: frPatrolTexts }).kinds[kind];

/** The map's note for a loop that met an ambush. */
export function ambushText(line: CartLogLine): string | null {
  if (!line.ambush) return null;
  const kind = kindName(line.ambush.kind);
  if (line.ambush.won === true) return t('supply.cart.toastWon', { kind });
  return t(line.ambush.won === null ? 'supply.cart.toastUnguarded' : 'supply.cart.toastLost', { kind });
}

/** The map's note for an unload the cart just made at a place. */
export function deliveryText(save: SaveData, line: CartPlaceLine): string | null {
  const [good, amount] = Object.entries(line.goods).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (good === undefined) return null;
  const order = save.supply.orders[line.placeId];
  const place = order ? orderPlaceName(order, tavernNameOf) : line.placeId;
  return t('supply.cart.deliveredNote', { n: amount, good: tr(materialById[good]?.name ?? good), place });
}

/** The map's note for a raid that just landed. */
export function raidText(line: RaidLogLine): string {
  const kind = kindName(line.kind);
  if (line.won === true) return t('supply.raid.toastWon', { kind });
  return t(line.won === null ? 'supply.raid.toastUnguarded' : 'supply.raid.toastLost', { kind });
}

/**
 * Settles the supply lines when the cart's or a raid's next moment is due,
 * while the app is open: one timeout at a time, none while nothing is under
 * way. An unload at a place, an ambushed loop or a landed raid shows a note on
 * the map, and an unload pops over the cart marker.
 */
export function useCartTick() {
  const on = useSupplyOn();
  const cart = useGameStore((s) => s.save.supply.cart);
  const raid = useGameStore((s) => s.save.supply.raid);

  useEffect(() => {
    if (!on) return;
    const now = Date.now();
    const save = useGameStore.getState().save;
    const due = [cartNextEventAt(cart), raidNextEventAt(save, now)].filter((at): at is number => at !== null);
    if (due.length === 0) return;
    const delay = Math.min(Math.max(Math.min(...due) - now, MIN_DELAY_MS), MAX_DELAY_MS);
    const timer = setTimeout(() => {
      const before = useGameStore.getState().save.supply;
      const lastLoop = before.cart.log.at(-1)?.n ?? 0;
      const lastRaid = before.raidLog.at(-1)?.landsAt ?? 0;
      const beforeUnloaded = before.cart.loop?.unloaded.length ?? 0;
      useGameStore.getState().settleSupply();
      const settled = useGameStore.getState().save;
      const after = settled.supply;
      // Unloads that just played out: the ones still on the running loop, and those of loops that just ended.
      const unloads = [
        ...(after.cart.loop?.unloaded.slice(beforeUnloaded) ?? []),
        ...after.cart.log.filter((line) => line.n > lastLoop).flatMap((line) => line.places),
      ];
      const unload = unloads[unloads.length - 1];
      const notes = [
        ...after.cart.log.filter((line) => line.n > lastLoop).map(ambushText),
        ...after.raidLog.filter((line) => line.landsAt > lastRaid).map(raidText),
      ].filter((line): line is string => line !== null);
      if (unload) {
        const text = deliveryText(settled, unload);
        const [good, n] = Object.entries(unload.goods).sort((a, b) => b[1] - a[1])[0] ?? [];
        if (text && good !== undefined) {
          useWorldStore.getState().set({ supplyMessage: { text, at: Date.now() }, cartPop: { good, n, at: Date.now() } });
          return;
        }
      }
      if (notes.length > 0) useWorldStore.getState().set({ supplyMessage: { text: notes[notes.length - 1], at: Date.now() } });
    }, delay);
    return () => clearTimeout(timer);
  }, [on, cart, raid]);
}

