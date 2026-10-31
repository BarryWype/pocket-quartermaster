import { useDebugStore } from '@/store/debugStore';

/** One recorded span: what it was, how long it took, and when it ended. */
export type TimingEntry = { name: string; durationMs: number; at: number };

/** How many entries to keep: the slowest recent ones, shown on the debug screen. */
const MAX_ENTRIES = 50;
/** Anything slower than one frame is worth a line in the release logs (adb logcat). */
const LOG_MS = 16;

/** Log tag for every slow timing, stable so release logs can be filtered on it. */
export const TIMING_LOG_TAG = '[perf]';

const entries: TimingEntry[] = [];
let tapMark: { target: string; at: number } | null = null;

/** Whether recording is on: the debug screen's "Record timings" switch. */
export const timingsEnabled = (): boolean => useDebugStore.getState().recordTimings;

function add(name: string, durationMs: number, at: number) {
  if (durationMs > LOG_MS) console.log(`${TIMING_LOG_TAG} ${name} ${durationMs.toFixed(1)}ms`);
  entries.push({ name, durationMs, at });
  if (entries.length > MAX_ENTRIES) {
    // Keep the slowest: drop the quickest of the lot.
    let slowest = 0;
    for (let i = 1; i < entries.length; i++) if (entries[i].durationMs < entries[slowest].durationMs) slowest = i;
    entries.splice(slowest, 1);
  }
}

/**
 * Times a synchronous computation. With recording off (the default), the
 * function simply runs — one boolean read and a call, nothing else.
 */
export function recordTiming<T>(name: string, run: () => T): T {
  if (!timingsEnabled()) return run();
  const at = Date.now();
  try {
    return run();
  } finally {
    add(name, Date.now() - at, at);
  }
}

/** Starts a manual span; the returned function ends and records it. */
export function startTiming(name: string): () => void {
  if (!timingsEnabled()) return () => {};
  const at = Date.now();
  return () => add(name, Date.now() - at, at);
}

/** Notes the moment of a tap (a marker press or a navigate) that should end with a screen or panel opening. */
export function markTap(target: string): void {
  if (timingsEnabled()) tapMark = { target, at: Date.now() };
}

/** The pending tap mark, if any, handed to the first thing that opens for it. */
export function takeTapMark(): { target: string; at: number } | null {
  const mark = tapMark;
  tapMark = null;
  return mark;
}

/** Records how long a tap took to reach what it opened. */
export function recordTapToOpen(name: string, target: string, at: number): void {
  add(`tap→open ${name} (${target})`, Date.now() - at, at);
}

/** Drops every recorded entry. */
export function clearTimings(): void {
  entries.length = 0;
}

/** The recorded entries, slowest first. */
export function timingEntries(): readonly TimingEntry[] {
  return [...entries].sort((a, b) => b.durationMs - a.durationMs);
}

/** Every entry as lines, for copying out of the app. */
export function timingsAsText(): string {
  return timingEntries()
    .map((entry) => `${new Date(entry.at).toISOString()} ${entry.durationMs.toFixed(1)}ms ${entry.name}`)
    .join('\n');
}
