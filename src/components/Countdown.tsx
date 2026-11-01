import { useIsFocused } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { clockConfig } from '@/content/clockConfig';
import { formatDuration } from '@/i18n';

import { Text } from './Text';

type Props = {
  /** When the countdown ends (ms since epoch); at or past it, 0 is shown. */
  endsAt: number;
  /** How the remaining time is written; `countdownText` by default. */
  format?: (msLeft: number) => string;
  /** Full control of what the remaining time renders; keeps a translated string around it. */
  render?: (msLeft: number) => ReactNode;
  style?: StyleProp<TextStyle>;
};

/**
 * The time left as a countdown shows it: whole minutes (rounded up, so never
 * less than is left) above one minute, seconds in the last one.
 */
export const countdownText = (ms: number) =>
  ms > clockConfig.secondsBelowMs ? formatDuration(Math.ceil(ms / 60_000) * 60_000, false) : formatDuration(ms);

/**
 * A time that runs out, ticking on its own: every `minutesMs` until its last
 * minute, then every second, never while its screen is unfocused, and stopped
 * at 0. Only this component re-renders each tick, never the screen around it.
 */
export function Countdown({ endsAt, format = countdownText, render, style }: Props) {
  const focused = useIsFocused();
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, endsAt - now);
  const interval = left > clockConfig.secondsBelowMs ? clockConfig.minutesMs : clockConfig.secondsMs;
  const done = left <= 0;

  useEffect(() => {
    if (!focused || done) return;
    // Back on the screen after a whole interval: catch up at once.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- returns the same value (no render) unless stale.
    setNow((previous) => (Date.now() - previous >= interval ? Date.now() : previous));
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [focused, done, interval]);

  if (render) return render(left);
  return <Text style={style}>{format(left)}</Text>;
}
