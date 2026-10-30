import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { dayKey } from '@/game/rewards/chests';
import { planNotifications } from '@/game/notifications/plan';
import { deliveryTime } from '@/game/notifications/quietHours';
import { stepAlerts } from '@/game/notifications/steps';
import type { NotificationCategory } from '@/game/notifications/types';
import { useTodaySteps } from '@/hooks/useTodaySteps';
import { deviceNotifications } from '@/services/notifications';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore } from '@/store/worldStore';

const hydrated = () => useGameStore.persist.hasHydrated() && useSettingsStore.persist.hasHydrated();

/** Where a tapped notification points: the map with a patrol to focus, or Pocket mode's escort. */
function openFrom(data: Record<string, unknown> | undefined) {
  if (data?.route === 'map') {
    useWorldStore.getState().set({
      focusPatrol: { id: String(data.patrolId), latitude: Number(data.latitude), longitude: Number(data.longitude) },
    });
    router.navigate('/');
  } else if (data?.route === 'quests') {
    router.navigate('/quests');
  } else if (data?.route === 'pocketMode') {
    useWorldStore.getState().set({ pocketPanel: 'escort' });
    router.navigate('/');
  }
}

/** Re-plans scheduled notifications from the save and settings, e.g. once permission is granted. */
export function syncPlan() {
  if (!hydrated()) return;
  const { save } = useGameStore.getState();
  const { notifications } = useSettingsStore.getState();
  const enabled = (category: NotificationCategory) => notifications.enabled && notifications.categories[category];
  deviceNotifications.sync(planNotifications(save, notifications, Date.now()), enabled).catch(() => {});
}

/**
 * Keeps OS notifications in step with the game: expedition results, the idle
 * reminder and the daily reset are scheduled ahead; step alerts are sent as
 * steps come in while the app is open.
 */
export function useNotifications() {
  const expeditions = useGameStore((state) => state.save.expeditions);
  const lastReport = useGameStore((state) => state.save.reports[0]?.finishedAt);
  const chests = useGameStore((state) => state.save.chests);
  const settings = useSettingsStore((state) => state.notifications);
  const steps = useTodaySteps();

  useEffect(() => {
    syncPlan();
  }, [expeditions, lastReport, settings]);

  useEffect(() => {
    const unsubscribe = [useGameStore, useSettingsStore].map((store) => store.persist.onFinishHydration(syncPlan));
    const appState = AppState.addEventListener('change', (state) => state === 'active' && syncPlan());
    return () => {
      unsubscribe.forEach((fn) => fn());
      appState.remove();
    };
  }, []);

  // A tapped notification opens what it points at; the one that launched the app is handled the same way.
  useEffect(() => {
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      Notifications.clearLastNotificationResponse();
      openFrom(last.notification.request.content.data);
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      openFrom(response.notification.request.content.data),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!hydrated()) return;
    const { save } = useGameStore.getState();
    const { stepAlertLog, set } = useSettingsStore.getState();
    const now = Date.now();
    const { alerts, log } = stepAlerts(save, steps, dayKey(new Date(now)), stepAlertLog, settings);
    if (alerts.length === 0 && log.day === stepAlertLog.day) return;
    set({ stepAlertLog: log });
    for (const alert of alerts) {
      const at = deliveryTime(now, alert.category, settings);
      deviceNotifications.send({ ...alert, at: at > now ? at : null }).catch(() => {});
    }
  }, [steps, chests, settings]);
}
