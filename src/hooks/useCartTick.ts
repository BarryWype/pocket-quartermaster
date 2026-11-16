import { useEffect } from 'react';

import { frPatrolTexts } from '@/content/fr/patrols';
import { patrolTexts } from '@/content/patrols';
import type { PatrolKind } from '@/game/patrols/generate';
import { cartNextEventAt } from '@/game/supply/cart';
import { raidNextEventAt } from '@/game/supply/raids';
import type { CartLogLine, RaidLogLine } from '@/game/supply/types';
import { localized, t } from '@/i18n';
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

/** The map's note for a raid that just landed. */
export function raidText(line: RaidLogLine): string {
  const kind = kindName(line.kind);
  if (line.won === true) return t('supply.raid.toastWon', { kind });
  return t(line.won === null ? 'supply.raid.toastUnguarded' : 'supply.raid.toastLost', { kind });
}

/**
 * Settles the supply lines when the cart's or a raid's next moment is due,
 * while the app is open: one timeout at a time, none while nothing is under
 * way. An ambushed loop or a landed raid shows a note on the map.
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
      useGameStore.getState().settleSupply();
      const after = useGameStore.getState().save.supply;
      const notes = [
        ...after.cart.log.filter((line) => line.n > lastLoop).map(ambushText),
        ...after.raidLog.filter((line) => line.landsAt > lastRaid).map(raidText),
      ].filter((line): line is string => line !== null);
      if (notes.length > 0) useWorldStore.getState().set({ supplyMessage: { text: notes[notes.length - 1], at: Date.now() } });
    }, delay);
    return () => clearTimeout(timer);
  }, [on, cart, raid]);
}
