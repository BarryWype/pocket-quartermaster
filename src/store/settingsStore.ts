import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { defaultNotificationSettings } from '@/game/notifications/plan';
import type { StepAlertLog } from '@/game/notifications/steps';
import type { NotificationCategory, NotificationSettings } from '@/game/notifications/types';
import type { Locale } from '@/i18n';

/** `system` follows the phone's language. */
export type LanguageSetting = Locale | 'system';

type SettingsState = {
  language: LanguageSetting;
  notifications: NotificationSettings;
  /** Step alerts already sent today. */
  stepAlertLog: StepAlertLog;
  /** Whether we already asked, in game, before showing the OS permission prompt. */
  askedNotificationPermission: boolean;
  updateNotifications: (change: Partial<NotificationSettings>) => void;
  setCategory: (category: NotificationCategory, on: boolean) => void;
  setQuietHours: (change: Partial<NotificationSettings['quietHours']>) => void;
  set: (change: Partial<Pick<SettingsState, 'language' | 'stepAlertLog' | 'askedNotificationPermission'>>) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'system',
      notifications: defaultNotificationSettings(),
      stepAlertLog: { day: '', sent: [] },
      askedNotificationPermission: false,
      updateNotifications: (change) => set(({ notifications }) => ({ notifications: { ...notifications, ...change } })),
      setCategory: (category, on) =>
        set(({ notifications }) => ({
          notifications: { ...notifications, categories: { ...notifications.categories, [category]: on } },
        })),
      setQuietHours: (change) =>
        set(({ notifications }) => ({
          notifications: { ...notifications, quietHours: { ...notifications.quietHours, ...change } },
        })),
      set: (change) => set(change),
    }),
    {
      name: 'pocket-quartermaster-settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, notifications, stepAlertLog, askedNotificationPermission }) => ({
        language,
        notifications,
        stepAlertLog,
        askedNotificationPermission,
      }),
      // New categories added later get their defaults.
      merge: (persisted, current) => {
        const saved = persisted as Partial<SettingsState> | undefined;
        const defaults = defaultNotificationSettings();
        return {
          ...current,
          ...saved,
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
