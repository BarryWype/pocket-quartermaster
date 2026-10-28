import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';

import { gatheringConfig } from '@/content/gatheringConfig';
import { appendFixes, emptyBuffer, shouldAutoStop, type WalkBuffer, type WalkFix } from '@/game/gathering/autoGather';
import { distanceMeters } from '@/game/generation/geo';
import { deliveryTime } from '@/game/notifications/quietHours';
import type { NotificationSettings } from '@/game/notifications/types';
import { notificationTexts } from '@/game/notifications/plan';
import { patrolNotifications } from '@/game/notifications/patrols';
import { backgroundStep, type BackgroundAlert, type BackgroundState } from '@/game/patrols/escort';
import { fill, formatDistance, t } from '@/i18n';
import { colors } from '@/theme';

import { deviceNotifications } from './notifications';
import { isCountingSteps } from './pedometer';

/**
 * Auto-gather's background tracking. The task appends fixes to a buffer in
 * storage (the game store may not be loaded when it runs) and steps the
 * patrol state (see stepPatrols); the app processes the buffer when it is
 * open (see useAutoGather).
 */

const TASK = 'pq-auto-gather';
const BUFFER_KEY = 'pocket-quartermaster-walk-buffer';
const BACKGROUND_KEY = 'pocket-quartermaster-background';
const SETTINGS_KEY = 'pocket-quartermaster-settings';
const config = gatheringConfig.autoGather;

/** The buffer, with the auto-stop delay the task needs. */
export type StoredBuffer = WalkBuffer & { autoStopMinutes: number };

/** What auto-gather may do: run in the background, only while the app is open, or nothing. */
export type AutoGatherPermission = 'background' | 'foreground' | 'denied';

let queue: Promise<unknown> = Promise.resolve();

async function read(): Promise<StoredBuffer> {
  const raw = await AsyncStorage.getItem(BUFFER_KEY);
  return raw ? (JSON.parse(raw) as StoredBuffer) : { ...emptyBuffer(Date.now()), autoStopMinutes: config.autoStopMinutes };
}

export function readBuffer() {
  return (queue = queue.then(read, read)) as Promise<StoredBuffer>;
}

/** Read-change-write, one at a time, so the task and the app don't overwrite each other. */
export function updateBuffer(change: (buffer: StoredBuffer) => StoredBuffer) {
  const run = async () => {
    const next = change(await read());
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(next));
    return next;
  };
  return (queue = queue.then(run, run)) as Promise<StoredBuffer>;
}

export const toWalkFix = (location: Location.LocationObject, stepsCounted: boolean): WalkFix => ({
  position: { latitude: location.coords.latitude, longitude: location.coords.longitude },
  accuracy: location.coords.accuracy,
  timestamp: location.timestamp,
  stepsCounted,
});

async function readStoredBackground(): Promise<BackgroundState | null> {
  const raw = await AsyncStorage.getItem(BACKGROUND_KEY);
  return raw ? (JSON.parse(raw) as BackgroundState) : null;
}

/** The background patrol state (null when Pocket mode is off), on the buffer's queue. */
export function readBackground() {
  return (queue = queue.then(readStoredBackground, readStoredBackground)) as Promise<BackgroundState | null>;
}

/** Read-change-write on the background state, one at a time, like the buffer. */
export function updateBackground(change: (state: BackgroundState | null) => BackgroundState | null) {
  const run = async () => {
    const next = change(await readStoredBackground());
    await AsyncStorage.setItem(BACKGROUND_KEY, JSON.stringify(next));
    return next;
  };
  return (queue = queue.then(run, run)) as Promise<BackgroundState | null>;
}

/**
 * Patrols, travellers and the escort along a batch of fixes: steps the stored
 * background state through them, and sends the alerts only when the app is
 * not open to show them itself.
 */
export async function stepPatrols(fixes: WalkFix[], appActive: boolean) {
  const kept = fixes.filter((fix) => fix.accuracy === null || fix.accuracy <= config.maxAccuracyMeters);
  if (kept.length === 0 || !(await readBackground())) return;
  const alerts: BackgroundAlert[] = [];
  const state = await updateBackground((current) => {
    if (!current) return current;
    const step = backgroundStep(current, kept.map((fix) => ({ position: fix.position, timestamp: fix.timestamp })), Date.now());
    alerts.push(...step.alerts);
    return step.state;
  });
  if (appActive || !state || alerts.length === 0) return;
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY).catch(() => null);
    const settings = raw ? (JSON.parse(raw) as { state?: { notifications?: NotificationSettings } }).state?.notifications : undefined;
    if (!settings) return;
    const now = Date.now();
    for (const notification of patrolNotifications(alerts, state.escort?.member.name ?? null, settings, now)) {
      await deviceNotifications.send(notification);
    }
  } catch {
    // A notification failure never breaks the task.
  }
}

/** Appends fixes from the app's own location watch (auto-gather limited to the app being open). */
export const appendFixesNow = async (fixes: WalkFix[]) => {
  await updateBuffer((buffer) => ({ ...buffer, ...appendFixes(buffer, fixes, Date.now()) }));
  await stepPatrols(fixes, true).catch(() => {});
};

/** The walk summary notification, when the player turned it on; held for quiet hours. */
async function notifyAutoStop(buffer: StoredBuffer) {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY).catch(() => null);
  const settings = raw ? (JSON.parse(raw) as { state?: { notifications?: NotificationSettings } }).state?.notifications : undefined;
  if (!settings?.enabled || !settings.categories.walkSummary) return;
  const meters = buffer.fixes.slice(1).reduce((sum, fix, i) => sum + distanceMeters(buffer.fixes[i].position, fix.position), 0);
  const now = Date.now();
  const at = deliveryTime(now, 'walkSummary', settings);
  const text = notificationTexts().walkSummary;
  await deviceNotifications.send({
    id: `walk:${now}`,
    category: 'walkSummary',
    group: 'steps',
    at: at > now ? at : null,
    title: text.title,
    body: fill(text.body, { distance: formatDistance(meters) }),
  });
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const stepsCounted = AppState.currentState === 'active' || isCountingSteps();
  const fixes = data.locations.map((location) => toWalkFix(location, stepsCounted));
  const now = Date.now();
  const buffer = await updateBuffer((current) => {
    const next = { ...current, ...appendFixes(current, fixes, now) };
    return shouldAutoStop(next, now, next.autoStopMinutes) ? { ...next, autoStopped: true } : next;
  });
  await stepPatrols(fixes, AppState.currentState === 'active').catch(() => {});
  if (!buffer.autoStopped) return;
  await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  await notifyAutoStop(buffer).catch(() => {});
});

export async function getAutoGatherPermission(): Promise<AutoGatherPermission> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return 'denied';
  return (await Location.getBackgroundPermissionsAsync()).granted ? 'background' : 'foreground';
}

/** Foreground first (the map's own permission, asked again if it was revoked), then background. */
export async function requestAutoGatherPermission(): Promise<AutoGatherPermission> {
  if (!(await Location.requestForegroundPermissionsAsync()).granted) return 'denied';
  // Android 11+ opens the system settings page here; the app re-checks when it comes back.
  return (await Location.requestBackgroundPermissionsAsync()).granted ? 'background' : 'foreground';
}

export const isTracking = () => Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);

/** Starts a walk: auto-stop counts from now. Fixes not processed yet are kept. */
export async function startTracking(autoStopMinutes: number, background: boolean) {
  await updateBuffer((buffer) => ({ ...buffer, lastMovedAt: Date.now(), autoStopped: false, autoStopMinutes }));
  if (!background || (await isTracking())) return;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.High,
    ...(Platform.OS === 'android'
      ? { timeInterval: config.tracking.androidTimeIntervalMs, distanceInterval: 0 }
      : { distanceInterval: config.tracking.iosDistanceIntervalMeters }),
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: t('autoGather.serviceTitle'),
      notificationBody: t('autoGather.serviceBody'),
      notificationColor: colors.wood,
    },
  });
}

export async function stopTracking() {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
}
