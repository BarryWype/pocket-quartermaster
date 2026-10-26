import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { notificationGroups } from '@/content/notifications';
import type { NotificationCategory, NotificationGroup, PlannedNotification } from '@/game/notifications/types';

export type NotificationPermission = { granted: boolean; canAskAgain: boolean };

export type NotificationService = {
  getPermission: () => Promise<NotificationPermission>;
  /** Shows the OS prompt; only called after the player agrees in-game. */
  requestPermission: () => Promise<boolean>;
  /**
   * Makes the scheduled notifications match the plan, and drops any held
   * step alert whose category is now off.
   */
  sync: (plan: PlannedNotification[], enabled: (category: NotificationCategory) => boolean) => Promise<void>;
  /** Shows a notification now, or at `at` when it is held for quiet hours. */
  send: (notification: PlannedNotification) => Promise<void>;
};

// Planned notifications are re-made on every sync; held step alerts are kept.
const PLAN_PREFIX = 'pq:plan:';
const STEP_PREFIX = 'pq:step:';

/** Shows notifications as banners even while the app is open, and sets up one Android channel per group. */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    for (const [id, group] of Object.entries(notificationGroups)) {
      Notifications.setNotificationChannelAsync(id, {
        name: group.title,
        description: group.description,
        importance: AndroidImportance.DEFAULT,
      }).catch(() => {});
    }
  }
}

function request(notification: PlannedNotification, identifier: string): Notifications.NotificationRequestInput {
  const channelId: NotificationGroup = notification.group;
  return {
    identifier,
    content: { title: notification.title, body: notification.body, data: { category: notification.category } },
    trigger:
      notification.at === null
        ? { channelId }
        : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notification.at, channelId },
  };
}

export const deviceNotifications: NotificationService = {
  getPermission: async () => {
    const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    return { granted, canAskAgain };
  },
  requestPermission: async () => (await Notifications.requestPermissionsAsync()).granted,
  sync: async (plan, enabled) => {
    if (!(await deviceNotifications.getPermission()).granted) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const { identifier, content } of scheduled) {
      const category = content.data?.category as NotificationCategory | undefined;
      // Anything not a held step alert is re-planned, including leftovers from older versions.
      if (!identifier.startsWith(STEP_PREFIX) || !category || !enabled(category)) {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      }
    }
    for (const notification of plan) {
      await Notifications.scheduleNotificationAsync(request(notification, PLAN_PREFIX + notification.id));
    }
  },
  send: async (notification) => {
    if (!(await deviceNotifications.getPermission()).granted) return;
    await Notifications.scheduleNotificationAsync(request(notification, STEP_PREFIX + notification.id));
  },
};
