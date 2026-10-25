import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { offsetPosition } from '@/game/generation/geo';
import type { LatLng, TimeOfDay } from '@/game/generation/types';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import type { MainRewardKind } from '@/game/types';

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
  /** Main reward the next successful expedition gets, then cleared. */
  forcedMainReward: MainRewardKind | null;
  /** A Sanctum placed by hand next to the player. */
  debugSanctum: SanctumSpawn | null;
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
      forcedMainReward: null,
      debugSanctum: null,
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
