import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs` while the screen is focused; on refocus, at once. */
export function useNow(intervalMs: number) {
  const focused = useIsFocused();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!focused) return;
    // Back on the screen after a whole interval: catch up at once.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- returns the same value (no render) unless stale.
    setNow((previous) => (Date.now() - previous >= intervalMs ? Date.now() : previous));
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [focused, intervalMs]);
  return now;
}
