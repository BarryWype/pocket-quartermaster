/**
 * useNow: a coarse clock that only ticks while its screen is focused. On
 * refocus it reads the time again at once, so nothing that comes back on
 * screen is stale by up to a whole interval.
 */
import { act, create } from 'react-test-renderer';

import { useEffect } from 'react';

import { useNow } from './useNow';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

/** Reads the hook's value after each render, without writing to it while rendering. */
let read: number | undefined;

function Probe({ interval }: { interval: number }) {
  const now = useNow(interval);
  useEffect(() => {
    read = now;
  }, [now]);
  return null;
}

const mount = (element: React.ReactElement) => create(element);

describe('useNow', () => {
  beforeEach(() => {
    mockFocused = true;
  });

  it('keeps the same time between ticks, then steps a whole interval', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(1_000_000);
      let renderer: ReturnType<typeof mount>;
      act(() => {
        renderer = mount(<Probe interval={5000} />);
      });
      expect(read).toBe(1_000_000);
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(read).toBe(1_000_000);
      act(() => {
        jest.advanceTimersByTime(4000);
      });
      expect(read).toBe(1_005_000);
      act(() => renderer!.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops while its screen is unfocused and reads the time again on refocus', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(1_000_000);
      let renderer: ReturnType<typeof mount>;
      act(() => {
        renderer = mount(<Probe interval={1000} />);
      });
      mockFocused = false;
      act(() => {
        renderer!.update(<Probe interval={1000} />);
      });
      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      expect(read).toBe(1_000_000);
      mockFocused = true;
      act(() => {
        renderer!.update(<Probe interval={1000} />);
      });
      expect(read).toBe(1_060_000);
      act(() => renderer!.unmount());
    } finally {
      jest.useRealTimers();
    }
  });
});
