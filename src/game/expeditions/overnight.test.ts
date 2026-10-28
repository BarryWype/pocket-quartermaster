import { dungeons, overnightQuestRules } from '@/content/dungeons';
import { startingHeroes } from '@/content/heroes';
import { dailyRotation, openDungeonIds } from '@/game/dungeons/rotation';
import { isDungeonAvailable, launchPlan, overnightUnderWay, resolveExpedition, startExpedition } from '@/game/expeditions/expeditions';
import { estimateOdds } from '@/game/expeditions/odds';
import type { HeroClassId } from '@/game/types';
import { expectedLevels } from '@/game/sim/config';
import { referenceTeam } from '@/game/sim/matrix';
import { createInitialSave, type SaveData } from '@/game/save';

const quests = dungeons.filter((d) => d.overnight);
const cleared = (tiers: number): SaveData => ({
  ...createInitialSave(),
  tutorial: { step: 'done', woodSpot: null },
  clearedDungeons: dungeons.filter((d) => d.isBoss && d.tier < tiers).map((d) => d.id),
});

describe('overnight quests', () => {
  it('has exactly one per tier, unlocked with its tier and never part of the rotation', () => {
    expect(quests.map((d) => d.tier)).toEqual([1, 2, 3, 4, 5]);
    for (const quest of quests) {
      expect(quest.slot).toBeUndefined();
      expect(quest.isBoss).toBeUndefined();
      expect(quest.recipeDrops).toEqual([]);
      for (const day of [10, 11, 12, 13]) {
        expect(openDungeonIds(dailyRotation(day))).not.toContain(quest.id);
        expect(isDungeonAvailable(cleared(quest.tier), quest, dailyRotation(day))).toBe(true);
      }
      // Locked until the tier below's boss has fallen.
      expect(isDungeonAvailable(cleared(quest.tier - 1), quest, dailyRotation(10))).toBe(quest.tier === 1);
    }
  });

  it('runs for the configured hours and pays the configured short runs', () => {
    const { goldRunsWorth, xpRunsWorth } = overnightQuestRules;
    for (const quest of quests) {
      expect(quest.durationMinutes).toBe(overnightQuestRules.durationHours * 60);
      const short = dungeons.find((d) => d.tier === quest.tier && d.slot === 'short')!;
      expect(quest.gold).toEqual([short.gold[0] * goldRunsWorth, short.gold[1] * goldRunsWorth]);
      expect(quest.xp).toBe(short.xp * xpRunsWorth);
      expect(quest.mainRewardChance).toBe(short.mainRewardChance);
    }
  });

  it('costs the capped supply: the configured hours per hero, not the run length', () => {
    const save = cleared(2);
    for (const quest of quests.slice(0, 2)) {
      const plan = launchPlan(save, quest, save.heroes.map((h) => h.id));
      expect(plan.need).toBe(overnightQuestRules.supplyHours * save.heroes.length);
      // The run itself still takes hours, not the supply's hours.
      expect(plan.minutes).toBe(quest.durationMinutes);
    }
  });

  it('lets only one patrol out at a time', () => {
    const save = cleared(2);
    const quest = quests[0];
    const other = quests[1];
    const ids = save.heroes.map((h) => h.id);
    const away = startExpedition(save, quest.id, ids, 1_000_000_000, 1, undefined, {});
    expect(overnightUnderWay(away)).toBe(true);
    // Not even another tier's quest leaves while a patrol is out.
    expect(() => startExpedition(away, other.id, ids, 1_000_000_001, 1, undefined, {})).toThrow(/already under way/);
    // Once collected, the patrol can go out again.
    const resolved = resolveExpedition(away, away.expeditions[0]);
    expect(overnightUnderWay(resolved.save)).toBe(false);
  });

  it('sits in its odds band with the tier’s Normal gear at the expected level', () => {
    for (const quest of quests) {
      const base = startingHeroes.map((h) => h.classId) as HeroClassId[];
      const save = referenceTeam(base, quest.tier, 'normal', expectedLevels[quest.tier - 1]);
      const odds = estimateOdds(save, save.heroes.map((h) => h.id), quest, 300);
      expect(odds.success).toBeGreaterThan(0.82);
      expect(odds.success).toBeLessThan(0.93);
    }
  });
});
