import { jobRules } from '@/content/jobs';

import { startExpedition } from '../expeditions/expeditions';
import { createInitialSave, type SaveData } from '../save';
import {
  assignJob,
  assignProblem,
  collectJob,
  currentEnergy,
  fullAt,
  isJobFull,
  isTired,
  jobCap,
  jobOutputNow,
  jobProduced,
  jobWorker,
  recallFromJob,
  settleJobs,
  tiredAt,
} from './jobs';

const HOUR = 3_600_000;
const CAP = jobCap('woodcutter');
const hero = (save: SaveData, id = 'bram') => save.heroes.find((h) => h.id === id)!;
const base = (): SaveData => ({ ...createInitialSave('seed'), tutorial: { ...createInitialSave('seed').tutorial, step: 'done' } });
/** Bram with his energy set to `value` at time 0. */
const withEnergy = (value: number): SaveData => ({
  ...base(),
  heroes: base().heroes.map((h) => (h.id === 'bram' ? { ...h, energy: { value, at: 0 } } : h)),
});
const working = () => assignJob(base(), 'bram', 'woodcutter', 0);

describe('hero energy', () => {
  it('drains 100 to 0 over 24 hours of work, then rests 0 to 100 in 6', () => {
    const save = working();
    expect(currentEnergy(save, hero(save), 0)).toBe(100);
    expect(currentEnergy(save, hero(save), 12 * HOUR)).toBeCloseTo(50);
    expect(currentEnergy(save, hero(save), 24 * HOUR)).toBe(0);
    expect(currentEnergy(save, hero(save), 27 * HOUR)).toBeCloseTo(50);
    expect(currentEnergy(save, hero(save), 30 * HOUR)).toBe(100);
    expect(currentEnergy(save, hero(save), 31 * HOUR)).toBeCloseTo(100 - 100 / 24);
  });

  it('rests a hero without a job, on an expedition too', () => {
    const save = recallFromJob(working(), 'bram', 12 * HOUR);
    expect(hero(save).energy.value).toBeCloseTo(50);
    const away = startExpedition(save, 'ratCellar', ['bram'], 12 * HOUR);
    expect(currentEnergy(away, hero(away), 13.5 * HOUR)).toBeCloseTo(75);
    expect(currentEnergy(away, hero(away), 18 * HOUR)).toBe(100);
  });

  it('clamps energy to 0..100', () => {
    expect(currentEnergy(withEnergy(150), hero(withEnergy(150)), 0)).toBe(100);
    expect(currentEnergy(withEnergy(-5), hero(withEnergy(-5)), 0)).toBe(0);
    const save = working();
    for (const hours of [3, 25, 31, 100]) {
      const value = currentEnergy(save, hero(save), hours * HOUR);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

describe('the tired cycle', () => {
  it('marks the hero tired while their energy refills, then working again', () => {
    const save = working();
    expect(isTired(save, hero(save), 0)).toBe(false);
    expect(isTired(save, hero(save), 24 * HOUR)).toBe(true);
    expect(currentEnergy(save, hero(save), 24 * HOUR)).toBe(0);
    expect(isTired(save, hero(save), 27 * HOUR)).toBe(true);
    expect(currentEnergy(save, hero(save), 27 * HOUR)).toBeCloseTo(50);
    expect(isTired(save, hero(save), 30 * HOUR)).toBe(false);
    expect(currentEnergy(save, hero(save), 30 * HOUR)).toBe(100);
    expect(currentEnergy(save, hero(save), 31 * HOUR)).toBeCloseTo(95.83, 2);
  });

  it('cycles on: 72 hours in is a half cycle again', () => {
    const save = working();
    expect(currentEnergy(save, hero(save), 72 * HOUR)).toBeCloseTo(50);
    expect(isTired(save, hero(save), 72 * HOUR)).toBe(false);
    // Two whole cycles of work behind, so the output is at the cap.
    expect(jobOutputNow(save, 'woodcutter', 72 * HOUR)).toBe(CAP);
  });

  it('settles at intermediate times without changing the later reading', () => {
    const direct = working();
    let settled = working();
    for (const hours of [10, 25, 50]) settled = settleJobs(settled, hours * HOUR);
    expect(hero(settled).job!.tired).toBe(isTired(direct, hero(direct), 50 * HOUR));
    expect(currentEnergy(settled, hero(settled), 72 * HOUR)).toBeCloseTo(currentEnergy(direct, hero(direct), 72 * HOUR));
    expect(jobOutputNow(settled, 'woodcutter', 72 * HOUR)).toBeCloseTo(jobOutputNow(direct, 'woodcutter', 72 * HOUR));
  });

  it('sends a hero assigned at 0 energy into the tired phase at once', () => {
    const save = assignJob(withEnergy(0), 'bram', 'woodcutter', 0);
    expect(hero(save).job!.tired).toBe(true);
    expect(currentEnergy(save, hero(save), 6 * HOUR)).toBe(100);
  });
});

describe('job output', () => {
  it('accrues at the rate during work, then stops at the cap', () => {
    const save = working();
    expect(jobCap('woodcutter')).toBe(0.5 * jobRules.capHours);
    expect(jobWorker(save, 'woodcutter')).toBe(hero(save));
    expect(jobOutputNow(save, 'woodcutter', 4 * HOUR)).toBeCloseTo(2);
    expect(jobOutputNow(save, 'woodcutter', 8 * HOUR)).toBeCloseTo(CAP);
    expect(jobOutputNow(save, 'woodcutter', 12 * HOUR)).toBeCloseTo(CAP);
    expect(isJobFull(save, 'woodcutter', 8 * HOUR)).toBe(true);
  });

  it('stops producing when the energy hits 0 part-way', () => {
    // Energy 10 buys 2.4 hours of work; the output stops there, even read later.
    const save = assignJob(withEnergy(10), 'bram', 'woodcutter', 0);
    expect(currentEnergy(save, hero(save), 2.4 * HOUR)).toBeCloseTo(0);
    expect(jobOutputNow(save, 'woodcutter', 2.4 * HOUR)).toBeCloseTo(1.2);
    expect(isTired(save, hero(save), 7 * HOUR)).toBe(true);
    expect(jobOutputNow(save, 'woodcutter', 7 * HOUR)).toBeCloseTo(1.2);
  });

  it('produces nothing without a worker', () => {
    const save = collectJob(working(), 'woodcutter', 0);
    expect(jobProduced(recallFromJob(save, 'bram', 0), 'woodcutter', 5 * HOUR)).toBe(0);
    expect(jobWorker(base(), 'woodcutter')).toBeUndefined();
  });
});

describe('collecting', () => {
  it('pays whole units and keeps the fraction', () => {
    const save = collectJob(working(), 'woodcutter', 3 * HOUR);
    expect(save.materials.wood).toBe(1);
    expect(jobOutputNow(save, 'woodcutter', 3 * HOUR)).toBeCloseTo(0.5);
    // Production carries on from the fraction: 5 more hours of work by 8 h.
    expect(jobOutputNow(save, 'woodcutter', 8 * HOUR)).toBeCloseTo(3);
  });

  it('starts filling again from zero after a full collect', () => {
    const collected = collectJob(working(), 'woodcutter', 8 * HOUR);
    expect(collected.materials.wood).toBe(4);
    expect(jobOutputNow(collected, 'woodcutter', 12 * HOUR)).toBeCloseTo(2);
  });

  it('is unchanged when there is nothing whole to collect', () => {
    const settled = settleJobs(working(), 1 * HOUR);
    expect(collectJob(settled, 'woodcutter', 1 * HOUR)).toBe(settled);
  });

  it('keeps the output through a recall, and pays it later', () => {
    const recalled = recallFromJob(working(), 'bram', 3 * HOUR);
    expect(hero(recalled).job).toBeNull();
    const collected = collectJob(recalled, 'woodcutter', 5 * HOUR);
    expect(collected.materials.wood).toBe(1);
    expect(jobOutputNow(collected, 'woodcutter', 5 * HOUR)).toBeCloseTo(0.5);
  });
});

describe('busy heroes', () => {
  it('refuses to assign an away, working or double-booked hero', () => {
    const away = startExpedition(base(), 'ratCellar', ['bram'], 0);
    expect(assignProblem(away, 'bram', 'woodcutter', 0)).toBe('away');
    expect(() => assignJob(away, 'bram', 'woodcutter', 0)).toThrow();
    const save = working();
    expect(assignProblem(save, 'bram', 'woodcutter', 0)).toBe('working');
    expect(assignProblem(save, 'lyra', 'woodcutter', 0)).toBe('taken');
    expect(() => assignJob(save, 'lyra', 'woodcutter', 0)).toThrow();
    expect(assignProblem(save, 'lyra', 'miner', 0)).toBe('unknown');
  });

  it('keeps a working hero off expeditions until recalled', () => {
    const save = working();
    expect(() => startExpedition(save, 'ratCellar', ['bram'], 0)).toThrow();
    const recalled = recallFromJob(save, 'bram', 0);
    expect(startExpedition(recalled, 'ratCellar', ['bram'], 0).expeditions).toHaveLength(1);
  });
});

describe('time helpers', () => {
  it('gives the exact time the output fills', () => {
    const save = working();
    expect(fullAt(save, 'woodcutter', 0)).toBe(8 * HOUR);
    expect(jobOutputNow(save, 'woodcutter', 8 * HOUR)).toBeCloseTo(CAP);
    expect(fullAt(save, 'woodcutter', 8 * HOUR)).toBeNull();
    expect(fullAt(base(), 'woodcutter', 0)).toBeNull();
    // Energy 10: 2.4 h of work, 6 h of rest, then 5.6 h more work to the cap.
    const tired = assignJob(withEnergy(10), 'bram', 'woodcutter', 0);
    expect(fullAt(tired, 'woodcutter', 0)).toBeCloseTo(14 * HOUR);
    expect(jobOutputNow(tired, 'woodcutter', 14 * HOUR)).toBeCloseTo(CAP);
  });

  it('gives the exact time the energy next hits 0', () => {
    const save = working();
    expect(tiredAt(save, hero(save), 0)).toBe(24 * HOUR);
    expect(currentEnergy(save, hero(save), 24 * HOUR)).toBe(0);
    // Tired at 25 h: the next 0 comes after the rest and a full work phase.
    const settled = settleJobs(save, 25 * HOUR);
    expect(hero(settled).job!.tired).toBe(true);
    expect(tiredAt(settled, hero(settled), 25 * HOUR)).toBe(54 * HOUR);
    expect(currentEnergy(settled, hero(settled), 54 * HOUR)).toBe(0);
    expect(tiredAt(base(), hero(base()), 0)).toBeNull();
  });
});

describe('determinism', () => {
  it('gives the same save for the same inputs', () => {
    const run = () => settleJobs(assignJob(base(), 'bram', 'woodcutter', 0), 25 * HOUR);
    expect(run()).toEqual(run());
  });
});
