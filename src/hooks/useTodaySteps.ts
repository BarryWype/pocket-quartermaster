import { useEffect } from 'react';
import { AppState } from 'react-native';

import { dayKey, stepsRecorded } from '@/game/rewards/chests';
import { devicePedometer } from '@/services/pedometer';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';

/**
 * Keeps today's step count in the save while the app runs. iOS also syncs the
 * OS history; Android can only count steps while the app is open.
 */
export function useStepTracking() {
  useEffect(() => {
    const { recordSteps, syncSteps } = useGameStore.getState();
    let stop: (() => void) | undefined;
    let cancelled = false;

    const syncHistory = async () => {
      const total = await devicePedometer.getStepsToday().catch(() => null);
      if (total !== null) syncSteps(dayKey(new Date()), total);
    };

    (async () => {
      if (!(await devicePedometer.requestPermission().catch(() => false)) || cancelled) return;
      await syncHistory();
      if (cancelled) return;
      stop = devicePedometer.watch((newSteps) => recordSteps(dayKey(new Date()), newSteps));
    })();

    const appState = AppState.addEventListener('change', (state) => state === 'active' && syncHistory());
    return () => {
      cancelled = true;
      stop?.();
      appState.remove();
    };
  }, []);
}

export function useTodaySteps() {
  const recorded = useGameStore((state) => stepsRecorded(state.save, dayKey(new Date())));
  const extraSteps = useDebugStore((state) => (__DEV__ ? state.extraSteps : 0));
  return recorded + extraSteps;
}
