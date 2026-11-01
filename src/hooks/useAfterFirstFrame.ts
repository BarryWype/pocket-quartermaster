import { useEffect, useState } from 'react';

/**
 * False on the first render, true once the first frame has painted (two
 * animation frames: the one that commits, then the one after it paints), with
 * a timeout as a safety net in case frames stall. Runs no work of its own: it
 * only moves the caller's real render one frame later, so a ghost shows first.
 */
export function useAfterFirstFrame(safetyMs = 250): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let second: number | null = null;
    const done = () => setReady(true);
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(done);
    });
    const safety = setTimeout(done, safetyMs);
    return () => {
      cancelAnimationFrame(first);
      if (second !== null) cancelAnimationFrame(second);
      clearTimeout(safety);
    };
  }, [safetyMs]);
  return ready;
}
