/**
 * The idle clocks: a Countdown holds the same text between its coarse ticks
 * (its identity), switches to seconds only in its last minute, stops at 0, and
 * never ticks while its screen is unfocused — the ticks an idle screen pays
 * for are the ones these tests pin down. The map, where the moving things
 * live, refreshes through useNow (clockConfig) alone: a raw setInterval would
 * run while off-screen and re-render the whole screen per tick.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Countdown } from '@/components/Countdown';
import { clockConfig } from '@/content/clockConfig';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

/** Mounts one Countdown and reads its rendered text. */
const mountCountdown = (make: () => ReactElement) => {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(make());
  });
  return {
    text: () => JSON.stringify(renderer!.toJSON()) ?? '',
    /** Re-renders, so a focus change is picked up like a real navigation would. */
    refresh: () => act(() => renderer!.update(make())),
    unmount: () => act(() => renderer!.unmount()),
  };
};

/** Advances the fake clock inside act(), so each tick commits on its own. */
const tick = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

describe('a countdown sitting on screen', () => {
  beforeEach(() => {
    mockFocused = true;
  });

  it('holds the same text between its coarse ticks', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(1_000_000);
      const over = mountCountdown(() => <Countdown endsAt={1_000_000 + 10 * 60_000} />);
      const first = over.text();
      tick(5000);
      expect(over.text()).toBe(first);
      tick(60_000);
      expect(over.text()).not.toBe(first);
      over.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ticks in seconds only in its last minute, and stops at 0', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(1_000_000);
      const lastMinute = mountCountdown(() => <Countdown endsAt={1_000_000 + 30_000} />);
      expect(lastMinute.text()).toContain('30');
      tick(clockConfig.secondsMs);
      expect(lastMinute.text()).toContain('29');
      const past = mountCountdown(() => <Countdown endsAt={1_000_000 - 1} />);
      const done = past.text();
      tick(clockConfig.secondsMs);
      expect(past.text()).toBe(done);
      lastMinute.unmount();
      past.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('never ticks while its screen is unfocused', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(1_000_000);
      const away = mountCountdown(() => <Countdown endsAt={1_000_000 + 30_000} />);
      const frozen = away.text();
      mockFocused = false;
      away.refresh();
      tick(60_000);
      expect(away.text()).toBe(frozen);
      away.unmount();
    } finally {
      jest.useRealTimers();
      mockFocused = true;
    }
  });
});

describe('the map screen', () => {
  it('refreshes through useNow, never a raw setInterval', () => {
    const source = readFileSync(join(__dirname, '../app/index.tsx'), 'utf8');
    expect(source).not.toMatch(/\bsetInterval\b/);
  });
});
