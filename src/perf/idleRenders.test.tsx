/**
 * Issue: how much work each menu screen does while it just sits open. A
 * screen that re-renders every second redraws its whole tree from a clock
 * nobody reads that fast. Each screen is mounted on the mid-game save, its
 * ghost flushed and its one-off effects (the expeditions odds) settled, and
 * then Profiler counts the update commits while exactly 10 s of fake time
 * pass: an idle screen commits at most once in that window (a coarse clock),
 * ideally not at all.
 */
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

import { midGameSave } from './menuFirstOpen.test';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useFocusEffect: () => {},
  useIsFocused: () => true,
  usePathname: () => '/',
  useLocalSearchParams: () => ({ heroId: 'bram' }),
  router: { push: () => {}, back: () => {}, replace: () => {}, navigate: () => {}, setParams: () => {} },
  Stack: { Screen: () => null },
}));

// Screens ask for permissions in effects; the test answers "not granted".
jest.mock('expo-location', () => {
  const denied = () => Promise.resolve({ granted: false, status: 'denied', canAskAgain: true });
  return {
    ...jest.requireActual('expo-location'),
    requestForegroundPermissionsAsync: denied,
    getForegroundPermissionsAsync: denied,
    requestBackgroundPermissionsAsync: denied,
    getBackgroundPermissionsAsync: denied,
    hasStartedLocationUpdatesAsync: () => Promise.resolve(false),
  };
});

// The screens' HP bars tick on their own; a static one keeps them out of the count.
jest.mock('@/components/HpBar', () => ({ HpBar: () => null }));

/** The screens whose idle re-render count matters. */
const SCREENS: [name: string, path: string][] = [
  ['expeditions', '@/app/expeditions'],
  ['team', '@/app/team/index'],
  ['hero', '@/app/team/[heroId]'],
  ['inventory', '@/app/inventory'],
];

/** The window the commits are counted over. */
const IDLE_MS = 10_000;

describe('a menu screen sitting open', () => {
  const save = midGameSave();

  it('commits at most once per 10 s', () => {
    const counts: Record<string, number> = {};
    jest.useFakeTimers({ doNotFake: ['performance'] });
    try {
      // Aligned to the minute so the expeditions odds' minute key cannot roll over mid-window.
      jest.setSystemTime(Math.floor(Date.now() / 60_000) * 60_000);
      for (const [name, path] of SCREENS) {
        jest.isolateModules(() => {
          jest.requireActual<typeof import('@/store/gameStore')>('@/store/gameStore').useGameStore.setState({ save });
          const { act, create } = jest.requireActual<typeof import('react-test-renderer')>('react-test-renderer');
          const react = jest.requireActual<typeof import('react')>('react');
          const Screen = jest.requireActual<{ default: ComponentType }>(path).default;
          let updates = 0;
          const onRender = (_id: string, phase: string) => {
            if (phase === 'update') updates++;
          };
          let renderer: ReactTestRenderer | undefined;
          act(() => {
            renderer = create(react.createElement(react.Profiler, { id: 'screen', onRender }, react.createElement(Screen)));
          });
          const treeJson = (r: ReactTestRenderer) => JSON.stringify(r.toJSON()) ?? '';
          // Flush the ghost: advance a millisecond at a time until the content replaces it.
          const ghostJson = treeJson(renderer!);
          let json = ghostJson;
          for (let tick = 0; tick <= 3000 && json === ghostJson; tick++) {
            act(() => {
              jest.advanceTimersByTime(1);
            });
            json = treeJson(renderer!);
          }
          expect(json).not.toBe(ghostJson);
          // Settle the one-off effects (the expeditions odds land a tick at a time).
          act(() => {
            jest.advanceTimersByTime(30_000);
          });
          updates = 0;
          // A second at a time, so each timer fire is its own commit instead of batching.
          for (let second = 0; second < IDLE_MS / 1000; second++) {
            act(() => {
              jest.advanceTimersByTime(1000);
            });
          }
          counts[name] = updates;
          act(() => renderer!.unmount());
        });
      }
    } finally {
      jest.useRealTimers();
    }

    console.log(`idle commits per ${IDLE_MS / 1000} s: ${SCREENS.map(([name]) => `${name}=${counts[name]}`).join(', ')}`);
    for (const [name] of SCREENS) {
      expect(counts[name]).toBeLessThanOrEqual(1);
    }
  });
});
