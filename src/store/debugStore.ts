import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { offsetPosition } from '@/game/generation/geo';
import type { LatLng, TimeOfDay } from '@/game/generation/types';

type DebugSettings = {
  /** When set, replaces the device GPS position. */
  mockLocation: LatLng | null;
  timeOfDay: TimeOfDay | null;
  /** When set, every resource kind refreshes on this window instead of its own. */
  windowMinutes: number | null;
  /** Expedition minutes become seconds. */
  fastExpeditions: boolean;
  /** Added to today's pedometer count. */
  extraSteps: number;
};

type DebugState = DebugSettings & {
  set: (settings: Partial<DebugSettings>) => void;
  moveMockLocation: (northMeters: number, eastMeters: number) => void;
};

export const useDebugStore = create<DebugState>()(
  persist(
    (set) => ({
      mockLocation: null,
      timeOfDay: null,
      windowMinutes: null,
      fastExpeditions: false,
      extraSteps: 0,
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
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set, moveMockLocation, ...settings }) => settings,
    },
  ),
);
