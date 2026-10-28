import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { gatheringConfig } from '@/content/gatheringConfig';
import { defaultNotificationSettings } from '@/game/notifications/plan';
import type { StepAlertLog } from '@/game/notifications/steps';
import type { NotificationCategory, NotificationSettings } from '@/game/notifications/types';
import type { Locale } from '@/i18n';

/** `system` follows the phone's language. */
export type LanguageSetting = Locale | 'system';

export type AutoGatherSettings = {
  /** The player turned auto-gather on (it may still be limited to the app being open). */
  enabled: boolean;
  autoStopMinutes: number;
  /** The info dialog was shown before the first turn-on. */
  introSeen: boolean;
};

type SettingsState = {
  language: LanguageSetting;
  notifications: NotificationSettings;
  /** Step alerts already sent today. */
  stepAlertLog: StepAlertLog;
  /** Whether we already asked, in game, before showing the OS permission prompt. */
  askedNotificationPermission: boolean;
  autoGather: AutoGatherSettings;
  updateNotifications: (change: Partial<NotificationSettings>) => void;
  setCategory: (category: NotificationCategory, on: boolean) => void;
  setQuietHours: (change: Partial<NotificationSettings['quietHours']>) => void;
  setAutoGather: (change: Partial<AutoGatherSettings>) => void;
  set: (change: Partial<Pick<SettingsState, 'language' | 'stepAlertLog' | 'askedNotificationPermission'>>) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'system',
      notifications: defaultNotificationSettings(),
      stepAlertLog: { day: '', sent: [] },
      askedNotificationPermission: false,
      autoGather: { enabled: false, autoStopMinutes: gatheringConfig.autoGather.autoStopMinutes, introSeen: false },
      updateNotifications: (change) => set(({ notifications }) => ({ notifications: { ...notifications, ...change } })),
      setCategory: (category, on) =>
        set(({ notifications }) => ({
          notifications: { ...notifications, categories: { ...notifications.categories, [category]: on } },
        })),
      setQuietHours: (change) =>
        set(({ notifications }) => ({
          notifications: { ...notifications, quietHours: { ...notifications.quietHours, ...change } },
        })),
      setAutoGather: (change) => set(({ autoGather }) => ({ autoGather: { ...autoGather, ...change } })),
      set: (change) => set(change),
    }),
    {
      name: 'pocket-quartermaster-settings',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, notifications, stepAlertLog, askedNotificationPermission, autoGather }) => ({
        language,
        notifications,
        stepAlertLog,
        askedNotificationPermission,
        autoGather,
      }),
      // v2 added auto-gather; `merge` fills in its defaults (off).
      migrate: (persisted) => persisted as Partial<SettingsState>,
      // New categories added later get their defaults.
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsState> | undefined;
        const defaults = defaultNotificationSettings();
        return {
          ...current,
          ...saved,
          autoGather: { ...current.autoGather, ...saved?.autoGather },
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
