import { startingHeroes } from '@/content/heroes';
import { dungeons } from '@/content/dungeons';
import { oddsRules } from '@/content/odds';
import { dungeonById } from '@/content/lookup';

import { dailyRotation, openDungeonIds, rotationDay } from '../dungeons/rotation';
import { createInitialSave, type SaveData } from '../save';
import { equip, isOnExpedition } from '../team/team';
import { briefingOf, highestUnlockedTier } from './expeditions';
import { estimateOdds } from './odds';
import { cachedOdds, oddsKey, storeOdds } from './oddsCache';
import { finishOddsTask } from './oddsSlices';
import { defaultParty, warmupAllows, warmupJobs, type WarmupStatus } from './oddsWarmup';

const ALL = startingHeroes.map((hero) => hero.id);
const DAY = rotationDay(0);

/** The starting heroes at a level, in a tier's weapons and armour (Normal), each with a healing potion. */
function team(tier: number, level: number): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'],
    heroes: createInitialSave().heroes.map((hero) => ({ ...hero, level })),
    consumables: { ...createInitialSave().consumables, healingPotion: 3 },
    gear: ALL.flatMap((_, i) => [
      { uid: `w${i}`, itemId: 'sword' + tier, quality: 'normal' as const },
      { uid: `a${i}`, itemId: 'mail' + tier, quality: 'normal' as const },
    ]),
  };
  ALL.forEach((id, i) => {
    save = equip(equip(equip(save, id, 'weapon', `w${i}`), id, 'armor', `a${i}`), id, 'consumable', 'healingPotion');
  });
  return save;
}

describe('the odds warm-up', () => {
  it('warms exactly the keys the Expeditions screen opens on, for the default tier and party', () => {
    const save = team(3, 5);
    const rotation = dailyRotation(DAY);
    const minute = 5;
    const party = defaultParty(save);
    expect(party).toEqual(ALL.slice(0, 3));
    const jobs = warmupJobs(save, rotation, minute);
    // The default tier is the highest unlocked one: its open dungeons plus the overnight one.
    const tier = highestUnlockedTier(save);
    const expectedIds = [
      ...openDungeonIds(rotation).filter((id) => dungeonById[id].tier === tier),
      ...dungeons.filter((d) => d.overnight && d.tier === tier).map((d) => d.id),
    ];
    expect(jobs.map((job) => job.dungeonId).sort()).toEqual(expectedIds.sort());
    // Each key is the one the screen computes for the same inputs.
    for (const job of jobs) {
      const dungeon = dungeonById[job.dungeonId];
      const briefing = briefingOf(save, dungeon, rotation, minute * 60_000);
      expect(job.key).toBe(oddsKey({ save, heroIds: party, dungeon, options: { now: minute * 60_000, briefing } }));
    }
  });

  it('fills the cache so the screen reads its odds at once', () => {
    const save = team(2, 3);
    const rotation = dailyRotation(DAY);
    const jobs = warmupJobs(save, rotation, 10);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(job.task).not.toBeNull();
      expect(cachedOdds(job.key)).toBeUndefined();
      storeOdds(job.key, finishOddsTask(job.task!));
      expect(cachedOdds(job.key)).toBeDefined();
    }
    // What warmed is what the screen would compute.
    const party = defaultParty(save);
    for (const job of jobs) {
      const dungeon = dungeonById[job.dungeonId];
      const briefing = briefingOf(save, dungeon, rotation, 600_000);
      expect(cachedOdds(job.key)).toEqual(estimateOdds(save, party, dungeon, 300, { now: 600_000, briefing }));
    }
  });

  it('skips jobs the cache already holds', () => {
    const save = team(2, 3);
    const rotation = dailyRotation(DAY);
    const jobs = warmupJobs(save, rotation, 11);
    for (const job of jobs) storeOdds(job.key, finishOddsTask(job.task!));
    // A new minute moves the keys (HP heals); the same minute keeps them.
    expect(warmupJobs(save, rotation, 11).every((job) => job.task === null)).toBe(true);
    expect(warmupJobs(save, rotation, 12).every((job) => job.task !== null)).toBe(true);
  });

  it('warms the tutorial dungeon alone while the tutorial runs', () => {
    const save = { ...team(1, 1), tutorial: { ...createInitialSave().tutorial, step: 'awaitReport' as const } };
    const rotation = dailyRotation(DAY);
    const jobs = warmupJobs(save, rotation, 0);
    expect(jobs.map((job) => job.dungeonId)).toEqual(['ratCellar']);
  });

  it('warms nothing when the whole party is away', () => {
    const save = team(2, 3);
    const away = {
      ...save,
      expeditions: [
        {
          id: 'x1',
          dungeonId: 'ratCellar',
          heroIds: ALL,
          startedAt: 0,
          endsAt: 1_000_000,
          seed: 'x1:0',
          notificationId: null,
        },
      ],
    };
    expect(defaultParty(away)).toEqual([]);
    expect(warmupJobs(away, dailyRotation(DAY), 0)).toEqual([]);
    // Sanity: the fixture really is "everyone away".
    expect(save.heroes.every((hero) => isOnExpedition(away, hero.id))).toBe(true);
  });
});

describe('when the warm-up may run', () => {
  const status = (overrides: Partial<WarmupStatus>): WarmupStatus => ({
    foreground: true,
    mapOnTop: true,
    lastInteractionAt: null,
    ...overrides,
  });

  it('runs only in the foreground, on the map, once the player is idle', () => {
    expect(warmupAllows(status({ foreground: false }), 10_000)).toBe(false);
    expect(warmupAllows(status({}), 10_000)).toBe(true);
    expect(warmupAllows(status({ foreground: false }), 10_000)).toBe(false);
    expect(warmupAllows(status({ foreground: false }), 10_000)).toBe(false);
    expect(warmupAllows(status({ mapOnTop: false }), 10_000)).toBe(false);
    // An interaction stops it until warmupResumeDelayMs has passed.
    const interacted = status({ lastInteractionAt: 10_000 });
    expect(warmupAllows(interacted, 10_000 + oddsRules.warmupResumeDelayMs - 1)).toBe(false);
    expect(warmupAllows(interacted, 10_000 + oddsRules.warmupResumeDelayMs)).toBe(true);
  });
});
