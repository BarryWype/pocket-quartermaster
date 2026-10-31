import type { ComponentType } from 'react';
import { useRef } from 'react';

import { recordTapToOpen, startTiming, takeTapMark } from '@/services/timings';

/**
 * Wraps a component so the debug profiler can time its render (its own body,
 * not its children's). With recording off, the wrapper costs one empty function
 * component — this is a `Profiler` that also works in release builds, where
 * React's own `Profiler` never fires.
 *
 * The first render of each wrapped component also records how long the tap
 * that opened it took to get there (see `markTap`), so a marker press to a panel
 * or a menu button to a screen shows up as `tap→open …`.
 */
export function timed<P extends object>(name: string, Component: ComponentType<P>): ComponentType<P> {
  function Timed(props: P) {
    const opened = useRef(false);
    const end = startTiming(`render ${name}`);
    try {
      return <Component {...props} />;
    } finally {
      end();
      if (!opened.current) {
        opened.current = true;
        const mark = takeTapMark();
        if (mark) recordTapToOpen(name, mark.target, mark.at);
      }
    }
  }
  Timed.displayName = `Timed(${name})`;
  return Timed;
}
