import { useEffect, useState } from 'react';

import type { Odds } from '@/game/expeditions/odds';
import { cachedOdds, storeOdds } from '@/game/expeditions/oddsCache';
import { recordTiming } from '@/services/timings';

/** A party's odds to compute: the key covers everything they read (save, party, gear, place, minute). */
export type OddsJob = { key: string; run: () => Odds };

/**
 * The success chance of a job: odds already held for its key at once, the
 * rest computed in a later tick so the render never waits on a simulation,
 * and only when the key changes. Undefined while computing, null without a job.
 */
export function useOdds(job: OddsJob | null): number | null | undefined {
  const [computed, setComputed] = useState<{ key: string; success: number } | null>(null);
  const key = job?.key ?? null;
  useEffect(() => {
    if (!job || cachedOdds(job.key) || computed?.key === job.key) return;
    const timer = setTimeout(() => {
      const odds = recordTiming('odds: party', job.run);
      storeOdds(job.key, odds);
      setComputed({ key: job.key, success: odds.success });
    });
    return () => clearTimeout(timer);
    // The key is the recompute trigger: it changes with everything the odds read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!job) return null;
  const held = cachedOdds(job.key);
  if (held) return held.success;
  return computed?.key === job.key ? computed.success : undefined;
}
