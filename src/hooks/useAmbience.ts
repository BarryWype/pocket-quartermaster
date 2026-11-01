import { useMemo } from 'react';

import { clockConfig } from '@/content/clockConfig';
import { rainingAt } from '@/game/generation/ambience';

import { useNow } from './useNow';

const read = (at: number) => {
  const now = new Date(at);
  return { hour: now.getHours() + now.getMinutes() / 60, raining: rainingAt(at) };
};

/** The local hour (fractional) and whether it's raining, checked once a minute. */
export function useAmbience() {
  const now = useNow(clockConfig.dayMs);
  return useMemo(() => read(now), [now]);
}
