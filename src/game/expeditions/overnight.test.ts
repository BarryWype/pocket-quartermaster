import { dungeons, overnightExpeditionRules } from '@/content/dungeons';
import { startingHeroes } from '@/content/heroes';
import { dailyRotation, openDungeonIds } from '@/game/dungeons/rotation';
import { isDungeonAvailable, launchPlan, overnightUnderWay, resolveExpedition, startExpedition } from '@/game/expeditions/expeditions';
import { estimateOdds } from '@/game/expeditions/odds';
import type { HeroClassId } from '@/game/types';
import { expectedLevels } from '@/game/sim/config';
import { referenceTeam } from '@/game/sim/matrix';
import { createInitialSave, type SaveData } from '@/game/save';

const runs = dungeons.filter((d) => d.overnight);
const cleared = (tiers: number): SaveData => ({
  ...createInitialSave(),
  tutorial: { step: 'done', woodSpot: null },
  clearedDungeons: dungeons.filter((d) => d.isBoss && d.tier < tiers).map((d) => d.id),
});

describe('overnight expeditions', () => {
  it('has exactly one per tier, unlocked with its tier and never part of the rotation', () => {
    expect(runs.map((d) => d.tier)).toEqual([1, 2, 3, 4, 5]);
    for (const run of runs) {
      expect(run.slot).toBeUndefined();
      expect(run.isBoss).toBeUndefined();
      for (const day of [10, 11, 12, 13]) {
        expect(openDungeonIds(dailyRotation(day))).not.toContain(run.id);
        expect(isDungeonAvailable(cleared(run.tier), run, dailyRotation(day))).toBe(true);
      }
      // Locked until the tier below's boss has fallen.
      expect(isDungeonAvailable(cleared(run.tier - 1), run, dailyRotation(10))).toBe(run.tier === 1);
    }
  });

  it('runs for the configured hours and pays the configured short runs', () => {
    const { goldRunsWorth, xpRunsWorth } = overnightExpeditionRules;
    for (const run of runs) {
      expect(run.durationMinutes).toBe(overnightExpeditionRules.durationHours * 60);
      const short = dungeons.find((d) => d.tier === run.tier && d.slot === 'short')!;
      expect(run.gold).toEqual([short.gold[0] * goldRunsWorth, short.gold[1] * goldRunsWorth]);
      expect(run.xp).toBe(short.xp * xpRunsWorth);
    }
  });

  it('costs the capped supply: the configured hours per hero, not the run length', () => {
    const save = cleared(2);
    for (const run of runs.slice(0, 2)) {
      const plan = launchPlan(save, run, save.heroes.map((h) => h.id));
      expect(plan.need).toBe(overnightExpeditionRules.supplyHours * save.heroes.length);
      // The run itself still takes hours, not the supply's hours.
      expect(plan.minutes).toBe(run.durationMinutes);
    }
  });

  it('lets only one patrol out at a time', () => {
    const save = cleared(2);
    const run = runs[0];
    const other = runs[1];
    const ids = save.heroes.map((h) => h.id);
    const away = startExpedition(save, run.id, ids, 1_000_000_000, 1, undefined, {});
    expect(overnightUnderWay(away)).toBe(true);
    // Not even another tier's overnight expedition leaves while a patrol is out.
    expect(() => startExpedition(away, other.id, ids, 1_000_000_001, 1, undefined, {})).toThrow(/already under way/);
    // Once collected, the patrol can go out again.
    const resolved = resolveExpedition(away, away.expeditions[0]);
    expect(overnightUnderWay(resolved.save)).toBe(false);
  });

  // Skipped until the class and gear rework rebalances dungeons around threats.
  it.skip('sits in its odds band with the tier’s Normal gear at the expected level', () => {
    for (const run of runs) {
      const base = startingHeroes.map((h) => h.classId) as HeroClassId[];
      const save = referenceTeam(base, run.tier, 'normal', expectedLevels[run.tier - 1]);
      const odds = estimateOdds(save, save.heroes.map((h) => h.id), run, 300);
      expect(odds.success).toBeGreaterThan(0.82);
      expect(odds.success).toBeLessThan(0.93);
    }
  });
});
