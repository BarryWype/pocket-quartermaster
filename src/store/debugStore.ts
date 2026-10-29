import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { offsetPosition } from '@/game/generation/geo';
import type { LatLng, TimeOfDay } from '@/game/generation/types';
import { applyOverrides, dailyRotation, rotationDay } from '@/game/dungeons/rotation';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import type { Briefing, MainRewardKind, Quality } from '@/game/types';

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
  /** Quality the next forged gear piece gets, then cleared. */
  forcedQuality: Quality | null;
  /** A tavern placed by hand next to the player. */
  debugTavern: { id: string; name: string; position: LatLng; expiresAt: number } | null;
  /** Changes every tavern's offers, to reroll them. */
  offerSeed: string;
  /** Days added to today's rotation day. */
  rotationDayOffset: number;
  /** Dungeons forced into a `tier:slot`, e.g. `2:short`. */
  forcedSlots: Record<string, string>;
  /** Briefings forced on dungeons, keyed by dungeon id. */
  forcedBriefings: Record<string, Briefing>;
  /** Shows auto-gather's radius around the player even while it is off. */
  showAutoRadius: boolean;
  /** Shows the tap range around the player and the auto radius around each node. */
  showNodeRanges: boolean;
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
  timeOfDay: null,
  windowMinutes: null,
  fastExpeditions: false,
  extraSteps: 0,
  forcedMainReward: null,
  debugSanctum: null,
  forcedQuality: null,
  rotationDayOffset: 0,
  debugTavern: null,
  offerSeed: '',
  forcedSlots: {},
  forcedBriefings: {},
  showAutoRadius: false,
  showNodeRanges: false,
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
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set, setEnabled, moveMockLocation, ...settings }) => settings,
    },
  ),
);

/** Whether the debug tools are available: always in development builds, and in release when turned on in Settings. */
export const debugEnabled = (state: Pick<DebugState, 'enabled'>) => __DEV__ || state.enabled;

/** Today's dungeon rotation, with the debug day shift and overrides when debug tools are on. */
export function currentRotation(now = Date.now()) {
  if (!debugEnabled(useDebugStore.getState())) return dailyRotation(rotationDay(now));
  const { rotationDayOffset, forcedSlots, forcedBriefings } = useDebugStore.getState();
  return applyOverrides(dailyRotation(rotationDay(now) + rotationDayOffset), { slots: forcedSlots, briefings: forcedBriefings });
}
