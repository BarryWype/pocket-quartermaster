import type { ReactElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import type { MotionLevel } from '@/content/motion';
import { useSettingsStore } from '@/store/settingsStore';

/** Test helpers for animated components: the level, what the UI thread would draw, and leak checks. */

export function setMotionLevel(level: MotionLevel) {
  useSettingsStore.setState({ animations: level });
}

const hosts = (renderer: ReactTestRenderer, prop: string) =>
  renderer.root.findAll((node) => typeof node.type === 'string' && node.props[prop] !== undefined);

/** The current animated style of every animated view, in render order. */
export const animatedStyles = (renderer: ReactTestRenderer): Record<string, unknown>[] =>
  hosts(renderer, 'jestAnimatedStyle').map((node: ReactTestInstance) => node.props.jestAnimatedStyle.value);

/** The current animated props of every animated view that has some, in render order. */
export const animatedProps = (renderer: ReactTestRenderer): Record<string, unknown>[] =>
  hosts(renderer, 'jestAnimatedProps')
    .map((node: ReactTestInstance) => node.props.jestAnimatedProps.value)
    .filter((props: Record<string, unknown>) => Object.keys(props).length > 0);

const mounted = new Set<ReactTestRenderer>();

/** Mounts with fake timers, so `jest.advanceTimersByTime` drives the frames. Call `cleanup` after each test. */
export function mount(element: ReactElement) {
  jest.useFakeTimers();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  mounted.add(renderer);
  return renderer;
}

/** Unmounts what the test left mounted, so a later level change re-renders nothing. */
export function cleanup() {
  act(() => mounted.forEach((renderer) => renderer.unmount()));
  mounted.clear();
}

export function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

/** Longer than any animation the config allows: whatever still runs after this is a loop or a re-arm. */
const SETTLE_MS = 5000;

/**
 * Mounts the element, lets `interact` start its animations, unmounts it halfway
 * through, and checks no timer or frame callback it started is still going.
 */
export function expectNothingLeftRunning(element: ReactElement, interact?: (renderer: ReactTestRenderer) => void) {
  jest.useFakeTimers();
  const before = jest.getTimerCount();
  const renderer = mount(element);
  if (interact) act(() => interact(renderer));
  advance(50);
  act(() => renderer.unmount());
  mounted.delete(renderer);
  advance(SETTLE_MS);
  expect(jest.getTimerCount()).toBe(before);
}
