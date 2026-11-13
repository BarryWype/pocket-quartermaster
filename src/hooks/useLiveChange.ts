import { useIsFocused } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/** Whether the app is in the foreground, followed by one listener for the whole app. iOS reports "unknown" at launch, which counts as in front. */
const inFront = (state: unknown) => state !== 'background' && state !== 'inactive';
let active = inFront(AppState.currentState);
let listening = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!listening) {
    listening = true;
    AppState.addEventListener('change', (state) => {
      const next = inFront(state);
      if (next === active) return;
      active = next;
      listeners.forEach((one) => one());
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

const readActive = () => active;

/** Whether the app is in the foreground, from one listener for the whole app. */
export const useAppActive = () => useSyncExternalStore(subscribe, readActive);

export type LiveChange<T> = {
  value: T;
  /** The value before the latest change. */
  from: T;
  /** The latest change happened while the screen was on view, before and after: it may animate. */
  live: boolean;
  /** Counts the changes, so each one can be told apart (a key, an effect). */
  changes: number;
  seen: boolean;
};

/**
 * Follows a shown value (a number, an id) and says whether its latest change was seen live: its
 * screen focused and the app in the foreground both on the render before the
 * change and on the change itself. A value that changed while the screen was
 * covered (the map frozen behind a menu screen) or the app was away arrives in
 * the same render that shows the screen again, so it is not live: it shows as
 * it is, without animating.
 */
export function useLiveChange<T extends number | string | null>(value: T): LiveChange<T> {
  const focused = useIsFocused();
  const appActive = useAppActive();
  return useTrackedChange(value, focused && appActive);
}

/** `useLiveChange` with the caller's own idea of being seen (a map marker: the app in front; the map freezes while covered). */
export function useTrackedChange<T extends number | string | null>(value: T, seen: boolean): LiveChange<T> {
  const [state, setState] = useState<LiveChange<T>>({ value, from: value, live: false, changes: 0, seen });
  if (state.value !== value || state.seen !== seen) {
    const changed = state.value !== value;
    // Stored during render, React's way of keeping the previous value: the render restarts with it at once.
    setState({ value, from: state.value, live: changed && state.seen && seen, changes: state.changes + (changed ? 1 : 0), seen });
  }
  return state;
}
