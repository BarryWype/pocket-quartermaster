import { oddsRules } from '@/content/odds';
import { rosterRules } from '@/content/roster';
import { dungeons } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';
import { tutorialRules } from '@/content/tutorial';

import type { Rotation } from '../dungeons/rotation';
import { briefingOf, isDungeonUnlocked } from './expeditions';
import { isOnExpedition } from '../team/team';
import { isRevealed } from '../reveal/reveal';
import type { SaveData } from '../save';
import { oddsKey, cachedOdds } from './oddsCache';
import { startOddsTask, type OddsTask } from './oddsSlices';

/** One estimate the warm-up can fill: the dungeon, the key the Expeditions screen will read, and its resumable task. */
export type WarmupJob = {
  dungeonId: string;
  key: string;
  /** Null when the odds are already in the cache (nothing to warm) or the party is empty. */
  task: OddsTask | null;
};

/**
 * The party Expeditions opens on: the first `partySize` heroes at home, in
 * roster order — the screen's default selection.
 */
export function defaultParty(save: SaveData): string[] {
  return save.heroes.filter((hero) => !isOnExpedition(save, hero.id)).slice(0, rosterRules.partySize).map((hero) => hero.id);
}

/**
 * The estimates the Expeditions screen opens on: its default tier's shown
 * dungeons (the tier's open ones plus the overnight one), the default party,
 * keyed exactly as the screen keys them, so what the warm-up fills is what the
 * screen reads from the cache at once. Only the dungeons still missing from
 * the cache carry a task.
 */
export function warmupJobs(save: SaveData, rotation: Rotation, minute: number): WarmupJob[] {
  const dungeonsShown = isRevealed(save, 'dungeons');
  if (!dungeonsShown && save.tutorial.step === 'done') return [];
  const party = defaultParty(save);
  if (party.length === 0) return [];
  // The screen's open list: today's rotation plus, during the tutorial, its own dungeon.
  const ids = dungeonsShown ? Object.values(rotation.tiers).flatMap((tier) => [tier.short, tier.long, tier.boss]) : [];
  if (save.tutorial.step !== 'done' && !ids.includes(tutorialRules.dungeonId)) ids.unshift(tutorialRules.dungeonId);
  const open = ids.map((id) => dungeonById[id]).filter((dungeon) => isDungeonUnlocked(save, dungeon)).sort((a, b) => a.tier - b.tier);
  const tiers = [...new Set(open.map((dungeon) => dungeon.tier))];
  if (tiers.length === 0) return [];
  // The highest tier by default; the first one while the tutorial runs.
  const tier = save.tutorial.step === 'done' ? tiers[tiers.length - 1] : tiers[0];
  const overnight = dungeonsShown
    ? dungeons.filter((dungeon) => dungeon.overnight && isDungeonUnlocked(save, dungeon) && dungeon.tier === tier)
    : [];
  const shown = [...open.filter((dungeon) => dungeon.tier === tier), ...overnight];
  const now = minute * 60_000;
  return shown.map((dungeon) => {
    const options = { now, briefing: briefingOf(save, dungeon, rotation, now) };
    const key = oddsKey({ save, heroIds: party, dungeon, options });
    return { dungeonId: dungeon.id, key, task: cachedOdds(key) ? null : startOddsTask(save, party, dungeon, undefined, options) };
  });
}

/** What decides whether the warm-up may run right now. */
export type WarmupStatus = {
  /** Whether the app is in the foreground (AppState 'active'): backgrounded means no warming. */
  foreground: boolean;
  /** Whether the map is the screen on top: another screen open means no warming. */
  mapOnTop: boolean;
  /** When the player last interacted (panned, tapped, navigated), if ever. */
  lastInteractionAt: number | null;
};

/**
 * Whether the warm-up may run: only in the foreground, only on the map, and
 * only once the player has been idle for `warmupResumeDelayMs`.
 */
export function warmupAllows(
  status: WarmupStatus,
  now: number,
  rules: { warmupResumeDelayMs: number } = oddsRules,
): boolean {
  if (!status.foreground) return false;
  if (!status.mapOnTop) return false;
  return status.lastInteractionAt === null || now >= status.lastInteractionAt + rules.warmupResumeDelayMs;
}
