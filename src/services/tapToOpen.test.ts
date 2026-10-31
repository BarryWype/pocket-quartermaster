import { useDebugStore } from '@/store/debugStore';

import { clearTimings, markTap, recordTapToOpen, takeTapMark, timingEntries } from './timings';

/**
 * The profiler's tap-to-first-frame (issue 17): a navigation marks its tap, the
 * first thing that opens for it takes the mark and records the span — so a
 * regression in how long Expeditions takes to first frame shows in the Timings
 * list as `tap→open screen: expeditions (expeditions)`.
 */
describe('the tap-to-open timing', () => {
  it('records the span from a navigation to the first thing it opens', () => {
    useDebugStore.setState({ recordTimings: true });
    clearTimings();

    markTap('expeditions');
    const mark = takeTapMark();
    expect(mark?.target).toBe('expeditions');
    recordTapToOpen('screen: expeditions', mark!.target, mark!.at);

    const entries = timingEntries();
    expect(entries.map((entry) => entry.name)).toContain('tap→open screen: expeditions (expeditions)');

    // The mark is taken once: the next screen doesn't inherit it.
    expect(takeTapMark()).toBeNull();
    clearTimings();
    useDebugStore.setState({ recordTimings: false });
  });

  it('marks nothing with recording off', () => {
    markTap('expeditions');
    expect(takeTapMark()).toBeNull();
  });
});
