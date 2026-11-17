import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { gatheringConfig } from '@/content/gatheringConfig';
import type { MotionLevel } from '@/content/motion';
import { defaultNotificationSettings } from '@/game/notifications/plan';
import type { StepAlertLog } from '@/game/notifications/steps';
import type { NotificationCategory, NotificationSettings } from '@/game/notifications/types';
import { migrateSettingsV2, type PocketModeSettings } from '@/game/patrols/pocketMode';
import type { Locale } from '@/i18n';

/** `system` follows the phone's language. */
export type LanguageSetting = Locale | 'system';

export type { PocketModeSettings };

type SettingsState = {
  language: LanguageSetting;
  notifications: NotificationSettings;
  /** Step alerts already sent today. */
  stepAlertLog: StepAlertLog;
  /** Whether we already asked, in game, before showing the OS permission prompt. */
  askedNotificationPermission: boolean;
  /** Sight range multiplier: how far sanctums, taverns and places show on the map. */
  sightRange: number;
  pocketMode: PocketModeSettings;
  /** How much the interface moves; the phone's reduce-motion setting lowers Full to Reduced. */
  animations: MotionLevel;
  /** Haptic feedback on presses, rewards and crafts. */
  haptics: boolean;
  updateNotifications: (change: Partial<NotificationSettings>) => void;
  setCategory: (category: NotificationCategory, on: boolean) => void;
  setQuietHours: (change: Partial<NotificationSettings['quietHours']>) => void;
  setPocketMode: (change: Partial<PocketModeSettings>) => void;
  set: (change: Partial<Pick<SettingsState, 'language' | 'stepAlertLog' | 'askedNotificationPermission' | 'sightRange' | 'animations' | 'haptics'>>) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'system',
      notifications: defaultNotificationSettings(),
      stepAlertLog: { day: '', sent: [] },
      askedNotificationPermission: false,
      sightRange: 1,
      pocketMode: { enabled: false, autoGather: true, patrolAlerts: true, escort: true, autoStopMinutes: gatheringConfig.autoGather.autoStopMinutes, introSeen: false },
      animations: 'full',
      haptics: true,
      updateNotifications: (change) => set(({ notifications }) => ({ notifications: { ...notifications, ...change } })),
      setCategory: (category, on) =>
        set(({ notifications }) => ({
          notifications: { ...notifications, categories: { ...notifications.categories, [category]: on } },
        })),
      setQuietHours: (change) =>
        set(({ notifications }) => ({
          notifications: { ...notifications, quietHours: { ...notifications.quietHours, ...change } },
        })),
      setPocketMode: (change) => set(({ pocketMode }) => ({ pocketMode: { ...pocketMode, ...change } })),
      set: (change) => set(change),
    }),
    {
      name: 'pocket-quartermaster-settings',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, notifications, stepAlertLog, askedNotificationPermission, sightRange, pocketMode, animations, haptics }) => ({
        language,
        notifications,
        stepAlertLog,
        askedNotificationPermission,
        sightRange,
        pocketMode,
        animations,
        haptics,
      }),
      // v3 folded auto-gather into Pocket mode; `merge` fills in its defaults.
      migrate: (persisted, version) =>
        (version < 3 ? migrateSettingsV2(persisted as Record<string, unknown>) : persisted) as Partial<SettingsState>,
      // Settings added later (new categories, animations, haptics) get their defaults.
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsState> | undefined;
        const defaults = defaultNotificationSettings();
        return {
          ...current,
          ...saved,
          pocketMode: { ...current.pocketMode, ...saved?.pocketMode },
          notifications: {
            ...defaults,
            ...saved?.notifications,
            categories: { ...defaults.categories, ...saved?.notifications?.categories },
          },
        };
      },
    },
  ),
);
