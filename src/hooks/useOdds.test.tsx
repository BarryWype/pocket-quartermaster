import { act, create } from 'react-test-renderer';

import type { Odds } from '@/game/expeditions/odds';

import { useOdds, type OddsJob } from './useOdds';

const odds = (success: number): Odds => ({ success } as Odds);

let shown: number | null | undefined;
function Probe({ job }: { job: OddsJob | null }) {
  shown = useOdds(job);
  return null;
}

describe('useOdds', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('computes off the render, once per key, and again when the party or gear changes the key', () => {
    const run = jest.fn(() => odds(0.5));
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Probe job={null} />);
    });
    expect(shown).toBeNull();

    act(() => renderer.update(<Probe job={{ key: 'party-a', run }} />));
    // The render never waits on a simulation.
    expect(shown).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
    act(() => jest.runOnlyPendingTimers());
    expect(shown).toBe(0.5);

    // Same key (a re-render with nothing changed): no recompute.
    act(() => renderer.update(<Probe job={{ key: 'party-a', run }} />));
    act(() => jest.runOnlyPendingTimers());
    expect(run).toHaveBeenCalledTimes(1);

    // A hero or gear change gives a new key: recomputed.
    const other = jest.fn(() => odds(0.75));
    act(() => renderer.update(<Probe job={{ key: 'party-b', run: other }} />));
    act(() => jest.runOnlyPendingTimers());
    expect(other).toHaveBeenCalledTimes(1);
    expect(shown).toBe(0.75);

    // Back to the first party: its odds are held, shown at once.
    act(() => renderer.update(<Probe job={{ key: 'party-a', run }} />));
    expect(shown).toBe(0.5);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
