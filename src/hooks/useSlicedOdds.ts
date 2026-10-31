import { useEffect, useRef, useState } from 'react';

import { EMPTY_ODDS, oddsOfTask, oddsTaskDone, runOddsSlice, type OddsTask } from '@/game/expeditions/oddsSlices';
import type { Odds } from '@/game/expeditions/odds';
import { cachedOdds, storeOdds } from '@/game/expeditions/oddsCache';

type Args = {
  /**
   * The cache key the estimate belongs to (see oddsCache.ts), or null while
   * there is nothing to compute at all.
   */
  key: string | null;
  /** Builds the resumable task for the current inputs. */
  build: () => OddsTask | null;
};

/**
 * Computes an odds estimate off the first frame, in small slices with a tick
 * between them (issue 17): the odds already held for the key show at once,
 * the screen shows "…" or the last known odds while the slices run, and the
 * finished estimate lands in the shared module cache for every other reader.
 */
export function useSlicedOdds({ key, build }: Args): Odds | undefined {
  const [computed, setComputed] = useState<{ key: string; odds: Odds } | null>(null);
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  });

  useEffect(() => {
    if (key === null) return;
    // Already held for this key: the cache's answer shows at once and nothing computes.
    if (cachedOdds(key) !== undefined) return;
    if (computed?.key === key) return;
    let cancelled = false;
    const finish = (odds: Odds) => {
      if (cancelled) return;
      storeOdds(key, odds);
      setComputed({ key, odds });
    };
    const task = buildRef.current();
    if (!task) {
      // An empty party: the odds are known without a single run.
      setTimeout(() => finish(EMPTY_ODDS), 0);
      return () => {
        cancelled = true;
      };
    }
    // One slice per tick; the caller's key change cancels and restarts.
    const step = () => {
      if (cancelled) return;
      runOddsSlice(task);
      if (!oddsTaskDone(task)) {
        setTimeout(step, 0);
        return;
      }
      finish(oddsOfTask(task));
    };
    setTimeout(step, 0);
    return () => {
      cancelled = true;
    };
    // The key covers everything the estimate reads: rerun only when it moves.
  }, [key, computed?.key]);

  if (key === null) return undefined;
  if (computed?.key === key) return computed.odds;
  return cachedOdds(key);
}
