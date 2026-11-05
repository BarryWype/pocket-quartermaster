import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { offsetPosition } from '@/game/generation/geo';
import type { LatLng, TimeOfDay } from '@/game/generation/types';
import { applyOverrides, dailyRotation, rotationDay } from '@/game/dungeons/rotation';
import type { PlaceSpawn } from '@/game/places/generate';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import type { TavernSpawn } from '@/game/taverns/taverns';
import type { LootCategory } from '@/game/loot/types';
import type { Briefing, Rarity } from '@/game/types';

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
  /** Loot category the next successful expedition is sure to drop, then cleared. */
  forcedLootCategory: LootCategory | null;
  /** A Sanctum placed by hand next to the player. */
  debugSanctum: SanctumSpawn | null;
  /** Rarity the next forged gear piece gets, then cleared. */
  forcedRarity: Rarity | null;
  /** A tavern placed by hand next to the player. */
  debugTavern: TavernSpawn | null;
  /** Places put by hand next to the player. */
  debugPlaces: PlaceSpawn[];
  /** Changes every tavern's offers, to reroll them. */
  offerSeed: string;
  /** Days added to today's rotation day. */
  rotationDayOffset: number;
  /** Briefings forced on dungeons, keyed by dungeon id. */
  forcedBriefings: Record<string, Briefing>;
  /** Shows auto-gather's radius around the player even while it is off. */
  showAutoRadius: boolean;
  /** Shows the tap range around the player and the auto radius around each node. */
  showNodeRanges: boolean;
  /** Guild Hall ranks ignore their tier boss gates. */
  guildGatesOpen: boolean;
  /** Times the map's and panels' computations and renders; the entries show on the debug screen. */
  recordTimings: boolean;
  /** Renders a plain background instead of the map while another screen covers it. */
  unmountMapWhenCovered: boolean;
  /** Foliage, sky and ambience (trail/water) off on the map. */
  noMapDecorations: boolean;
  /** `Deferred` renders the content directly, no ghost. */
  noContentDeferral: boolean;
  /** The stack's push/pop has no animation. */
  noScreenAnimation: boolean;
  /** Patrol and auto-gather intervals pause while a screen other than the map is open. */
  pauseBackgroundHooks: boolean;
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
  forcedLootCategory: null,
  debugSanctum: null,
  forcedRarity: null,
  rotationDayOffset: 0,
  debugTavern: null,
  debugPlaces: [],
  offerSeed: '',
  forcedBriefings: {},
  showAutoRadius: false,
  showNodeRanges: false,
  guildGatesOpen: false,
  recordTimings: false,
  unmountMapWhenCovered: false,
  noMapDecorations: false,
  noContentDeferral: false,
  noScreenAnimation: false,
  pauseBackgroundHooks: false,
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
  const { rotationDayOffset, forcedBriefings } = useDebugStore.getState();
  return applyOverrides(dailyRotation(rotationDay(now) + rotationDayOffset), { briefings: forcedBriefings });
}
