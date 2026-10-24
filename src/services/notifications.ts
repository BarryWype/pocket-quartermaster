import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type NotificationService = {
  /** Resolves to an id for cancelling, or null when notifications are not allowed. */
  scheduleAt: (date: Date, title: string, body: string) => Promise<string | null>;
  cancel: (id: string) => Promise<void>;
};

const CHANNEL_ID = 'expeditions';

/** Shows notifications as banners even while the app is open. Call once at startup. */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function ensurePermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Expeditions',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export const deviceNotifications: NotificationService = {
  scheduleAt: async (date, title, body) => {
    if (!(await ensurePermission())) return null;
    return Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
    });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
};
