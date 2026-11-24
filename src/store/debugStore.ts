import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { offsetPosition } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { dailyRotation, rotationDay } from '@/game/dungeons/rotation';

type DebugSettings = {
  /** When set, replaces the device GPS position. */
  mockLocation: LatLng | null;
  /** Times the map's and panels' computations and renders; the entries show on the debug screen. */
  recordTimings: boolean;
};

type DebugState = DebugSettings & {
  /** Debug tools in a release build, turned on from Settings. Development builds always have them. */
  enabled: boolean;
  /** Turning the tools off also resets every debug option. */
  setEnabled: (enabled: boolean) => void;
  set: (settings: Partial<DebugSettings>) => void;
  moveMockLocation: (northMeters: number, eastMeters: number) => void;
};

/** Every debug option off; turning the debug tools off resets to this. */
const DEBUG_DEFAULTS: DebugSettings = {
  mockLocation: null,
  recordTimings: false,
};

export const useDebugStore = create<DebugState>()(
  persist(
    (set) => ({
      ...DEBUG_DEFAULTS,
      enabled: false,
      setEnabled: (enabled) => set(enabled ? { enabled } : { ...DEBUG_DEFAULTS, enabled }),
      set: (settings) => set(settings),
      moveMockLocation: (northMeters, eastMeters) =>
        set((state) => ({
          mockLocation: state.mockLocation
            ? offsetPosition(state.mockLocation, northMeters, eastMeters)
            : null,
        })),
    }),
    {
      name: 'pocket-quartermaster-debug',
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set, setEnabled, moveMockLocation, ...settings }) => settings,
      // Version 3 persisted every debug option; version 4 keeps only these three.
      migrate: (persisted) => {
        const old = persisted as Partial<DebugSettings & { enabled: boolean }> | undefined;
        return {
          ...DEBUG_DEFAULTS,
          mockLocation: old?.mockLocation ?? null,
          recordTimings: old?.recordTimings ?? false,
          enabled: old?.enabled ?? false,
        };
      },
    },
  ),
);

/** Whether the debug tools are available: always in development builds, and in release when turned on in Settings. */
export const debugEnabled = (state: Pick<DebugState, 'enabled'>) => __DEV__ || state.enabled;

/** Today's dungeon rotation. */
export function currentRotation(now = Date.now()) {
  return dailyRotation(rotationDay(now));
}
