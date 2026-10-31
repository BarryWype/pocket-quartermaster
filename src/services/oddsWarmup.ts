import { AppState } from 'react-native';

import { oddsRules } from '@/content/odds';
import { oddsOfTask, oddsTaskDone, runOddsSlice } from '@/game/expeditions/oddsSlices';
import { warmupAllows, warmupJobs, type WarmupJob, type WarmupStatus } from '@/game/expeditions/oddsWarmup';
import { storeOdds } from '@/game/expeditions/oddsCache';
import { currentRotation } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';

/**
 * The idle odds warm-up (issue 17): a few seconds after the map shows, and
 * again whenever the inputs the odds read move (the HP minute, the party, the
 * gear, the briefing, the day), the default tier's odds keys — the ones the
 * Expeditions screen opens on — are computed in the same small slices as the
 * screen itself, at low priority, and stored in the shared module cache.
 *
 * It never runs while the player interacts: a pan, tap or navigation stops it,
 * and it resumes once they have been idle for `warmupResumeDelayMs`. It never
 * runs while another screen is on top (`setWarmupMapOnTop`, wired from the map
 * screen's focus) or the app is in the background (its AppState listener).
 * The decisions live in `warmupAllows`; this module is the thin glue.
 */

/** Whether the map is the screen on top; the map screen keeps this in step with its focus. */
let mapOnTop = false;
/** When the player last interacted, if ever. */
let lastInteractionAt: number | null = null;
/** The start delay after arming, and the retry pace once everything is warm. */
let pending: ReturnType<typeof setTimeout> | null = null;
/** Whether a slice loop is between slices. */
let looping = false;
/** The current estimates, rebuilt whenever the inputs move. */
let jobs: WarmupJob[] = [];

const status = (): WarmupStatus => ({
  // currentState reads undefined before the first listener is attached: treat that as background.
  foreground: AppState.currentState === 'active',
  mapOnTop,
  lastInteractionAt,
});

/** Reads the current inputs and rebuilds the job list (cheap: keys and cache reads). */
function refreshJobs() {
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  jobs = warmupJobs(useGameStore.getState().save, currentRotation(now), minute);
}

function schedule(delayMs: number) {
  if (pending !== null) clearTimeout(pending);
  pending = setTimeout(tick, delayMs);
}

/** Stops the slice loop without disarming; the next tick resumes from the pending job. */
function stopLoop() {
  looping = false;
}

/** Whether the warm-up has been armed (once per app run). */
let warmupStarted = false;

function tick() {
  pending = null;
  if (!warmupAllows(status(), Date.now())) {
    // Not allowed right now: check again when the player has been idle again.
    schedule(oddsRules.warmupResumeDelayMs);
    return;
  }
  // Re-read the inputs every pass: a new minute, a party or gear change moves the keys.
  refreshJobs();
  if (!jobs.some((job) => job.task && !oddsTaskDone(job.task))) {
    schedule(oddsRules.warmupResumeDelayMs);
    return;
  }
  looping = true;
  // One slice per tick — the same low priority as the screens' own slices.
  const step = () => {
    if (!looping) return;
    const job = jobs.find((entry) => entry.task && !oddsTaskDone(entry.task));
    if (!job || !job.task) {
      looping = false;
      schedule(oddsRules.warmupResumeDelayMs);
      return;
    }
    runOddsSlice(job.task);
    if (oddsTaskDone(job.task)) storeOdds(job.key, oddsOfTask(job.task));
    if (!warmupAllows(status(), Date.now())) {
      stopLoop();
      schedule(oddsRules.warmupResumeDelayMs);
      return;
    }
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

/** Arms the warm-up: the map screen calls this once, after it is shown. */
export function armOddsWarmup(): void {
  if (warmupStarted) return;
  warmupStarted = true;
  AppState.addEventListener('change', () => {
    // Backgrounded (or the notification shade): stop mid-slice-loop; the retry resumes.
    if (AppState.currentState !== 'active') stopLoop();
  });
  refreshJobs();
  schedule(oddsRules.warmupStartDelayMs);
}

/** Notes a player interaction (a pan, a tap): the warm-up stops and resumes when idle again. */
export function noteWarmupInteraction(): void {
  lastInteractionAt = Date.now();
  stopLoop();
}

/** The map screen reports whether it is the screen on top. */
export function setWarmupMapOnTop(onTop: boolean): void {
  mapOnTop = onTop;
  if (!onTop) stopLoop();
}
