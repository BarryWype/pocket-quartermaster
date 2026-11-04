import { classSpecials } from '@/content/classSpecials';
import { questRules } from '@/content/quests';

import { todaysCollector } from './loot/valuables';
import { migrateSave } from './migrations';
import { createInitialSave, type SaveData } from './save';
import type { Quest } from './quests/types';
import { rolledSpecial } from './team/specials';

const DAY = 86_400_000;
const origin = { latitude: 0, longitude: 0 };
const marketId = 'place:market:tile:0:1';

describe('save migrations', () => {
  const collector = (id: string, overrides: Partial<Quest> = {}): Quest => ({
    id,
    objective: 'collector',
    band: 'short',
    arrivedAt: 100,
    expiresAt: 2 * DAY,
    acceptedAt: 200,
    amount: 1,
    progress: 0,
    target: { placeId: marketId, kind: 'market', position: origin, from: origin, expiresAt: 5 * DAY },
    doneAt: null,
    seen: true,
    ...overrides,
  });

  const walk: Quest = {
    id: 'walk-1',
    objective: 'walk',
    band: 'medium',
    arrivedAt: 300,
    expiresAt: 2 * DAY,
    acceptedAt: 400,
    amount: 1000,
    progress: 120,
    stepsAtArrive: 10,
    target: null,
    doneAt: null,
    seen: true,
  };

  const withQuests = (...list: Quest[]): SaveData => {
    const save = createInitialSave();
    return { ...save, quests: { ...save.quests, list } };
  };

  it('turns an open collector without its valuable into a sell goods quest', () => {
    const save = withQuests(collector('q-1'));
    const now = 10 * DAY;
    const next = migrateSave(save, 30, now);
    const quest = next.quests.list[0];
    expect(quest.id).toBe('q-1');
    expect(quest.objective).toBe('sellGoods');
    expect(quest.band).toBe('short');
    expect(quest.arrivedAt).toBe(100);
    expect(quest.expiresAt).toBe(2 * DAY);
    expect(quest.acceptedAt).toBe(200);
    expect(quest.seen).toBe(true);
    expect(quest.amount).toBe(questRules.sellGoodsGold[0]);
    expect(quest.progress).toBe(0);
    expect(quest.target).toBe(null);
    expect(quest.itemId).toBeUndefined();
  });

  it('keeps an open collector whose market wants a valuable the player holds', () => {
    const now = 10 * DAY;
    const save = withQuests(collector('q-1'));
    const wanted = todaysCollector(save, marketId, now);
    save.valuables = { [`${wanted}:2`]: 1 };
    const next = migrateSave(save, 30, now);
    expect(next.quests.list[0].objective).toBe('collector');
    expect(next.quests.list[0].itemId).toBe(wanted);
    expect(next.quests.list[0].target).toEqual(save.quests.list[0].target);
  });

  it('leaves done collectors and other quests alone', () => {
    const done = collector('q-1', { doneAt: 1000 });
    const save = withQuests(done, walk);
    const next = migrateSave(save, 30, 10 * DAY);
    expect(next.quests.list[0]).toEqual(done);
    expect(next.quests.list[1]).toEqual(walk);
  });

  it('does nothing for a save already at version 32', () => {
    const save = withQuests(collector('q-1'));
    expect(migrateSave(save, 32, 10 * DAY)).toBe(save);
  });

  it('starts the personal tavern check unset for a version 31 save', () => {
    const { personalTavern, ...save } = createInitialSave();
    const next = migrateSave(save as unknown as SaveData, 31, 10 * DAY);
    expect(next.personalTavern).toBeNull();
    expect(next).toEqual({ ...save, personalTavern: null });
  });

  // A version 32 save: its heroes have no special yet.
  const save = createInitialSave();
  const v32 = { ...save, heroes: save.heroes.map(({ special: _special, ...hero }) => hero) } as unknown as SaveData;

  it('rolls every hero a special from its class pool, and changes nothing else', () => {
    const next = migrateSave(v32, 32, 10 * DAY);
    expect(next).toEqual(save);
    for (const hero of next.heroes) {
      const pool = classSpecials[hero.classId];
      expect([...pool.common, pool.rare]).toContain(hero.special);
      expect(hero.special).toBe(rolledSpecial(hero.id, hero.classId));
    }
  });

  it('rolls the missing specials of a save another build already stamped 33', () => {
    expect(migrateSave(v32, 33, 10 * DAY)).toEqual(save);
  });

  it('rolls the same special for the same hero id', () => {
    expect(migrateSave(v32, 32, 10 * DAY)).toEqual(migrateSave(v32, 32, 20 * DAY));
  });

  it('leaves heroes that already have a special alone', () => {
    const rare = classSpecials[v32.heroes[0].classId].rare;
    const withSpecial = { ...v32, heroes: [{ ...v32.heroes[0], special: rare }, ...v32.heroes.slice(1)] } as SaveData;
    const next = migrateSave(withSpecial, 32, 10 * DAY);
    expect(next.heroes[0]).toBe(withSpecial.heroes[0]);
    expect(next.heroes.slice(1).every((hero) => hero.special)).toBe(true);
  });

  describe('version 35: jobs', () => {
    // A version 34 save: no jobs, no energy, no job output.
    const save = createInitialSave();
    const { jobOutput: _jobOutput, ...rest } = save;
    const v34 = { ...rest, heroes: save.heroes.map(({ job: _job, energy: _energy, ...hero }) => hero) } as unknown as SaveData;

    it('gives every hero no job and full energy, and the save no job output', () => {
      const next = migrateSave(v34, 34, 10 * DAY);
      for (const hero of next.heroes) {
        expect(hero.job).toBeNull();
        expect(hero.energy).toEqual({ value: 100, at: 10 * DAY });
      }
      expect(next.jobOutput).toEqual({});
    });

    it('keeps everything else the player has', () => {
      const next = migrateSave(v34, 34, 10 * DAY);
      expect({ ...next, heroes: next.heroes.map((h) => ({ ...h, energy: save.heroes[0].energy })) }).toEqual(save);
    });

    it('leaves a save already at version 35 alone', () => {
      expect(migrateSave(save, 35, 10 * DAY)).toBe(save);
    });
  });

  describe('version 36: gathering jobs', () => {
    // A version 35 save: output was one amount per station, and choices were not saved yet.
    const fresh = createInitialSave();
    const { jobOutput: _jobOutput, jobChoice: _jobChoice, ...rest } = fresh;
    const v35 = {
      ...rest,
      jobOutput: { woodcutter: { amount: 2.5, since: 5 * DAY } },
    } as unknown as SaveData;

    it('turns a station amount into whole units of its material plus the fraction', () => {
      const next = migrateSave(v35, 35, 10 * DAY);
      expect(next.jobOutput.woodcutter).toEqual({ amounts: { wood: 2 }, fraction: 0.5, units: 2, since: 5 * DAY });
      expect(next.jobChoice).toEqual({ miner: null });
    });

    it('keeps nothing but the fraction of an amount below one unit', () => {
      const subUnit = { ...v35, jobOutput: { woodcutter: { amount: 0.25, since: 6 * DAY } } } as unknown as SaveData;
      expect(migrateSave(subUnit, 35, 10 * DAY).jobOutput.woodcutter).toEqual({
        amounts: {},
        fraction: 0.25,
        units: 0,
        since: 6 * DAY,
      });
    });

    it('keeps a choice the save already had', () => {
      const withChoice = { ...v35, jobChoice: { miner: 'stone' } } as unknown as SaveData;
      expect(migrateSave(withChoice, 35, 10 * DAY).jobChoice).toEqual({ miner: 'stone' });
    });

    it('carries a version 34 save through both job migrations', () => {
      const save = createInitialSave();
      const { jobOutput: _out, jobChoice: _choice, heroes: heroesWithJobs, ...restOf } = save;
      const v34 = {
        ...restOf,
        heroes: heroesWithJobs.map(({ job: _job, energy: _energy, ...hero }) => hero),
      } as unknown as SaveData;
      const next = migrateSave(v34, 34, 10 * DAY);
      expect(next.jobOutput).toEqual({});
      expect(next.jobChoice).toEqual({ miner: null });
      for (const hero of next.heroes) {
        expect(hero.job).toBeNull();
        expect(hero.energy.value).toBe(100);
      }
    });

    it('leaves a save already at version 36 alone', () => {
      const save = createInitialSave();
      expect(migrateSave(save, 36, 10 * DAY)).toBe(save);
    });
  });

  describe('version 37: the outdoor gatherer', () => {
    // A version 36 save: heroes could work jobs, an entry could hold output.
    const v36 = () => {
      const fresh = createInitialSave();
      return {
        ...fresh,
        heroes: fresh.heroes.map((h) => (h.id === 'bram' ? { ...h, job: { jobId: 'woodcutter', since: 10 * DAY, tired: false } } : h)),
        jobOutput: { woodcutter: { amounts: { wood: 2 }, fraction: 0.5, units: 2, since: 10 * DAY } },
      } as SaveData;
    };

    it('migrates without a camp, gatherer output or new counters', () => {
      const next = migrateSave(v36(), 36, 12 * DAY);
      expect(next.jobOutput.woodcutter).toEqual({ amounts: { wood: 2 }, fraction: 0.5, units: 2, since: 10 * DAY });
      expect(next.jobOutput.gatherer).toBeUndefined();
      for (const hero of next.heroes) {
        expect(hero.job?.camp).toBeUndefined();
      }
      expect(next.jobChoice.miner).toBeNull();
    });

    it('leaves a save already carrying its choices alone', () => {
      const save = v36();
      expect(migrateSave(save, 36, 12 * DAY)).toBe(save);
      expect(migrateSave(save, 37, 12 * DAY)).toBe(save);
    });
  });
});
