import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { gatheringConfig } from '@/content/gatheringConfig';
import { materialById } from '@/content/lookup';
import { clearProcessed, shouldAutoStop, walkTileKeys, type WalkFix, type WalkSummary } from '@/game/gathering/autoGather';
import { snapshotBackground } from '@/game/patrols/escort';
import { needsBackgroundState, patrolSettingsFrom, pocketTracking } from '@/game/patrols/pocketMode';
import type { MaterialStack } from '@/game/types';
import { formatDistance, t, tr } from '@/i18n';
import { walkableTiles } from '@/services/mapTiles';
import { devicePedometer } from '@/services/pedometer';
import {
  getAutoGatherPermission,
  isTracking,
  readBuffer,
  requestAutoGatherPermission,
  startTracking,
  stopTracking,
  updateBackground,
  updateBuffer,
  type AutoGatherPermission,
} from '@/services/walkTracking';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore, type AutoGatherMode } from '@/store/worldStore';

const config = gatheringConfig.autoGather;
/** While the app is open, fixes are processed this often so the map keeps up. */
const LIVE_INTERVAL_MS = 10_000;

const setMode = (autoGather: AutoGatherMode) => useWorldStore.getState().set({ autoGather });
const say = (text: string) => useWorldStore.getState().set({ autoGatherMessage: { text, at: Date.now() } });
const hydrated = () => useGameStore.persist.hasHydrated() && useSettingsStore.persist.hasHydrated();

export const materialsText = (stacks: MaterialStack[]) =>
  stacks.map((g) => `${g.amount} ${tr(materialById[g.materialId]?.name ?? g.materialId)}`).join(', ');

/** Turns tracking off with the switch, noting it stopped by itself. */
async function autoStop() {
  await stopTracking();
  await updateBuffer((buffer) => ({ ...buffer, autoStopped: true }));
  useSettingsStore.getState().setPocketMode({ enabled: false });
  setMode('off');
}

/**
 * Makes tracking match the switch and the permission the player gave: starts
 * it again after the app was killed, falls back to "app open only" or off when
 * permission was taken away, and stops after a while without movement.
 */
async function reconcile(foregrounded: boolean) {
  const { pocketMode } = useSettingsStore.getState();
  const running = await isTracking();
  if (!pocketTracking(pocketMode)) {
    if (running) await stopTracking();
    return setMode('off');
  }
  const permission = await getAutoGatherPermission().catch((): AutoGatherPermission => 'denied');
  if (permission === 'denied') {
    await stopTracking();
    useSettingsStore.getState().setPocketMode({ enabled: false });
    return setMode('off');
  }
  const buffer = await readBuffer();
  // "App open only" doesn't track while away, so its auto-stop counts from the return.
  const away = foregrounded && permission === 'foreground';
  if (!away && (buffer.autoStopped || shouldAutoStop(buffer, Date.now(), pocketMode.autoStopMinutes))) return autoStop();
  if (permission === 'background') {
    if (!running) await startTracking(pocketMode.autoStopMinutes, true);
    return setMode('on');
  }
  if (running) await stopTracking();
  if (away) await startTracking(pocketMode.autoStopMinutes, false);
  setMode('limited');
}

/**
 * Processes the buffered fixes: loads the map tiles along the walk, then
 * collects. A walk whose tiles failed to load waits for a later try, for a
 * while. `away` walks (recorded while the app was closed) go into the history.
 */
async function processBuffer(away: boolean): Promise<WalkSummary | null> {
  const buffer = await readBuffer();
  if (buffer.fixes.length === 0 && !buffer.autoStopped) return null;
  const keys = walkTileKeys(useGameStore.getState().save, buffer.fixes);
  const tiles = Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await walkableTiles.load(key)] as const)));
  const oldest = buffer.fixes[0]?.timestamp ?? Date.now();
  if (keys.some((key) => tiles[key] === null) && Date.now() - oldest < config.tileRetryHours * 3_600_000) return null;

  const fresh = buffer.fixes.filter((f) => f.timestamp > useGameStore.getState().save.autoGather.processedUntil);
  const measuredSteps =
    Platform.OS === 'ios' && fresh.length > 1
      ? await devicePedometer.getStepsBetween(fresh[0].timestamp, fresh[fresh.length - 1].timestamp).catch(() => null)
      : null;
  const summary = useGameStore.getState().processWalk(
    buffer.fixes,
    { tiles, estimateSteps: Platform.OS !== 'ios', measuredSteps, autoStopped: buffer.autoStopped },
    away,
  );
  const processedUntil = useGameStore.getState().save.autoGather.processedUntil;
  await updateBuffer((current) => ({ ...clearProcessed(current, processedUntil), autoStopped: false }));
  return summary;
}

let running: Promise<void> | null = null;

/**
 * Folds the background task's fight results into the save, then hands the task
 * a fresh state: its `pending` starts empty, which is the hand-off. Without
 * patrol alerts or an escort there is no state to keep, so it is cleared.
 */
export async function syncBackground() {
  await updateBackground((current) => {
    if (current?.pending.length) useGameStore.getState().mergeBackground(current.pending);
    if (current?.questArrivals?.length) useGameStore.getState().noteMarksReached(current.questArrivals);
    const { pocketMode, notifications } = useSettingsStore.getState();
    if (!needsBackgroundState(pocketMode)) return null;
    const save = useGameStore.getState().save;
    return snapshotBackground(save, patrolSettingsFrom(pocketMode, save, notifications.patrolAlertFor), Date.now(), current);
  });
}

/** One update at a time: reconcile tracking, then process what came in. */
export function refreshAutoGather(foregrounded: boolean) {
  if (!hydrated()) return Promise.resolve();
  running ??= (async () => {
    // A failed start (e.g. the system refusing the service) must not hold up processing.
    await reconcile(foregrounded).catch(() => {});
    const summary = await processBuffer(foregrounded);
    await syncBackground();
    // The "While you walked" card shows walks that gathered something.
    if (!summary || summary.nodes > 0) {
      if (summary && !foregrounded) say(t('autoGather.gained', { items: materialsText(summary.gained) }));
      return;
    }
    if (summary.autoStopped) say(t('autoGather.autoStopped', { minutes: useSettingsStore.getState().pocketMode.autoStopMinutes }));
    else if (foregrounded && summary.distanceMeters > 0) say(t('autoGather.nothingInReach', { distance: formatDistance(summary.distanceMeters) }));
  })()
    .catch(() => {})
    .finally(() => {
      running = null;
    });
  return running;
}

/** Turns auto-gather on after the info dialog: asks for background location, then tracks. */
export async function enableAutoGather(): Promise<AutoGatherPermission> {
  const permission = await requestAutoGatherPermission().catch((): AutoGatherPermission => 'denied');
  if (permission === 'denied') return permission;
  const { autoStopMinutes } = useSettingsStore.getState().pocketMode;
  useSettingsStore.getState().setPocketMode({ enabled: true });
  try {
    await startTracking(autoStopMinutes, permission === 'background');
  } catch {
    // The switch goes back off, with the same advice as a refusal: check location in system settings.
    useSettingsStore.getState().setPocketMode({ enabled: false });
    setMode('off');
    return 'denied';
  }
  setMode(permission === 'background' ? 'on' : 'limited');
  await syncBackground();
  return permission;
}

/** Turns auto-gather off and processes what is left in the buffer. */
export async function disableAutoGather() {
  useSettingsStore.getState().setPocketMode({ enabled: false });
  await stopTracking();
  setMode('off');
  await refreshAutoGather(true);
  await syncBackground();
}

/** Debug: feeds a route into the buffer and processes it as if the app had just come back. */
export async function playBack(fixes: WalkFix[]) {
  await updateBuffer((buffer) => ({ ...buffer, fixes: [...buffer.fixes, ...fixes].sort((a, b) => a.timestamp - b.timestamp) }));
  const summary = await processBuffer(true);
  return summary;
}

/** Keeps auto-gather running and processed: on launch, on return to the app, and every few seconds while open. */
export function useAutoGather() {
  useEffect(() => {
    const unsubscribe = [useGameStore, useSettingsStore].map((store) => store.persist.onFinishHydration(() => refreshAutoGather(true)));
    refreshAutoGather(true);
    const appState = AppState.addEventListener('change', (state) => state === 'active' && refreshAutoGather(true));
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && pocketTracking(useSettingsStore.getState().pocketMode)) refreshAutoGather(false);
    }, LIVE_INTERVAL_MS);
    return () => {
      unsubscribe.forEach((fn) => fn());
      appState.remove();
      clearInterval(timer);
    };
  }, []);
}
