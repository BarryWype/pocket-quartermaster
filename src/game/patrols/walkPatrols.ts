import { gatheringConfig } from '@/content/gatheringConfig';

import type { WalkPatrols } from '../gathering/autoGather';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import type { MaterialStack } from '../types';
import type { BackgroundResult } from './escort';
import { rewardMaterials, type PatrolFight } from './fight';

/** Material stacks merged into one per id. */
const mergeStacks = (stacks: MaterialStack[]): MaterialStack[] =>
  Object.entries(stacks.reduce<Record<string, number>>((counts, stack) => addMaterials(counts, [stack]), {})).map(([materialId, amount]) => ({
    materialId,
    amount,
  }));

/**
 * The patrols a walk met: the escort's background fights plus the player's
 * own resolved ones, with what the wins paid summed the way the "While you
 * walked" card shows it — gold and materials once, XP per hero who fought.
 */
export function walkPatrolsFrom(
  results: BackgroundResult[],
  fights: PatrolFight[],
  heroHp: WalkPatrols['escortHp'] = null,
): WalkPatrols {
  const met = [
    ...results.map((result) => ({
      kind: result.kind,
      tier: result.tier,
      elite: false,
      by: 'escort' as const,
      won: result.won,
      heroes: 1,
      rewards: result.rewards,
    })),
    ...fights.map((fight) => ({
      kind: fight.kind,
      tier: fight.tier,
      elite: fight.elite,
      by: 'you' as const,
      won: fight.won,
      heroes: fight.heroIds.length,
      rewards: fight.rewards,
    })),
  ];
  const wins = met.filter((fight) => fight.won);
  return {
    fights: met.map(({ kind, tier, elite, by, won }) => ({ kind, tier, elite, by, won })),
    escortHp: heroHp ?? null,
    travellers: [],
    gold: wins.reduce((sum, { rewards }) => sum + rewards.gold, 0),
    xp: wins.reduce((sum, { heroes, rewards }) => sum + rewards.xp * heroes, 0),
    materials: mergeStacks(wins.flatMap(({ rewards }) => rewardMaterials(rewards))),
  };
}

/** The escort's HP over a batch of results: where the earliest fight found it, and where the latest left it. */
export function escortHpChange(results: BackgroundResult[]): WalkPatrols['escortHp'] {
  const ordered = [...results].sort((a, b) => a.at - b.at);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return first && last ? { heroId: last.heroId, before: first.hpBefore, after: last.hpAfter, max: last.maxHp } : null;
}

/**
 * Adds the patrols met on a walk to the walk history: merged into the newest
 * walk the player has not dismissed yet, or, without one, a walk of their own
 * — the escort fights on even when the player stood still.
 */
export function addPatrolsToWalks(save: SaveData, patrols: WalkPatrols, at: number): SaveData {
  if (patrols.fights.length === 0 && patrols.travellers.length === 0) return save;
  const latest = save.autoGather.history[0];
  if (latest && !latest.seen) {
    const existing = latest.patrols ?? { fights: [], escortHp: null, travellers: [], gold: 0, xp: 0, materials: [] };
    const merged: WalkPatrols = {
      fights: [...existing.fights, ...patrols.fights],
      // The story runs from where the first batch found the escort to where the latest left them.
      escortHp:
        existing.escortHp && patrols.escortHp
          ? { heroId: patrols.escortHp.heroId, before: existing.escortHp.before, after: patrols.escortHp.after, max: patrols.escortHp.max }
          : (patrols.escortHp ?? existing.escortHp),
      travellers: [...existing.travellers, ...patrols.travellers],
      gold: existing.gold + patrols.gold,
      xp: existing.xp + patrols.xp,
      materials: mergeStacks([...existing.materials, ...patrols.materials]),
    };
    return {
      ...save,
      autoGather: { ...save.autoGather, history: [{ ...latest, patrols: merged }, ...save.autoGather.history.slice(1)] },
    };
  }
  const history = [
    {
      startedAt: at,
      endedAt: at,
      distanceMeters: 0,
      nodes: 0,
      gained: [],
      steps: 0,
      stepsEstimated: false,
      ignored: {},
      autoStopped: false,
      patrols,
      seen: false,
    },
    ...save.autoGather.history,
  ].slice(0, gatheringConfig.autoGather.historySize);
  return { ...save, autoGather: { ...save.autoGather, history } };
}
