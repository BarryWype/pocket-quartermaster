import { gathererRules } from '@/content/jobs';

import { spawnPositionAt } from '../generation/animalPaths';
import { distanceMeters } from '../generation/geo';
import { canGather, collectedKeepFrom } from '../gathering/gathering';
import { pruneExpired } from '../upkeep';
import { createInitialSave, type SaveData } from '../save';
import { currentHp } from '../team/health';
import {
  assignJob,
  assignProblem,
  collectJob,
  fullAt,
  isJobFull,
  jobCap,
  jobOutputDetail,
  jobOutputNow,
  moveCamp,
  recallFromJob,
  settleJobs,
  workDone,
  cycleAt,
} from './jobs';
import { gathererCapNodes, gathererFinds } from './gatherer';

const HOUR = 3_600_000;
const CAMP = { latitude: 48.85, longitude: 2.35 };
/** Past the tutorial, where wood, ore, herbs and animals all show on the map. */
const base = (): SaveData => ({ ...createInitialSave('seed'), tutorial: { ...createInitialSave('seed').tutorial, step: 'done' } });
const hero = (save: SaveData): (typeof save.heroes)[number] => save.heroes.find((h) => h.id === 'bram')!;
/** Bram working the gatherer at a fixed camp from time 0. */
const camped = (): SaveData => assignJob(base(), 'bram', 'gatherer', 0, CAMP);

describe('the outdoor gatherer', () => {
  it('needs a position to be assigned, and keeps one camp per assignment', () => {
    expect(assignProblem(base(), 'bram', 'gatherer', 0)).toBe('noPosition');
    expect(() => assignJob(base(), 'bram', 'gatherer', 0)).toThrow();
    const save = camped();
    expect(hero(save).job!.camp).toEqual({ position: CAMP, since: 0 });
    const moved = moveCamp(save, { latitude: 48.86, longitude: 2.36 }, HOUR);
    expect(hero(moved).job!.camp).toEqual({ position: { latitude: 48.86, longitude: 2.36 }, since: HOUR });
    const recalled = recallFromJob(moved, 'bram', HOUR);
    expect(hero(recalled).job).toBeNull();
  });

  it('only takes nodes inside the circle, before their expiry, that nobody collected', () => {
    const save = camped();
    const { nodes } = gathererFinds(save, 'gatherer', 0, 24 * HOUR);
    expect(nodes.length).toBeGreaterThan(0);
    const worker = hero(save);
    for (const node of nodes) {
      expect(node.at).toBeLessThan(node.spawn.expiresAt);
      expect(node.at).toBeGreaterThan(0);
      expect(node.at).toBeLessThanOrEqual(8 * HOUR + 1e-6); // one cap's worth of working time
      expect(distanceMeters(CAMP, spawnPositionAt(node.spawn, node.at - 1))).toBeLessThanOrEqual(gathererRules.radiusMeters);
      expect(node.spawn.id in save.collected).toBe(false);
      expect(canGather(save, node.spawn)).toBe(true);
      expect(node.gained.length).toBeGreaterThan(0);
      expect(workDone(worker, cycleAt(worker, node.at))).toBeGreaterThanOrEqual(0);
    }
    // A node the player took is never taken again, on a later scan too.
    const taken = nodes[0].spawn.id;
    const withCollected = { ...save, collected: { ...save.collected, [taken]: nodes[0].at } };
    expect(gathererFinds(withCollected, 'gatherer', 0, 24 * HOUR).nodes.map((n) => n.spawn.id)).not.toContain(taken);
    expect(gathererFinds(withCollected, 'gatherer', 6 * HOUR, 24 * HOUR).nodes.map((n) => n.spawn.id)).not.toContain(taken);
  });

  it('keeps the collected entry of a taken node until the gatherer has scanned past it', () => {
    const settled = settleJobs(camped(), 6 * HOUR);
    // A node the player took at 20 h, past the gatherer's last settle (6 h) but long expired by 100 h.
    const withCollected = { ...settled, collected: { 'taken:node:here': 20 * HOUR } };
    expect(withCollected.collected['taken:node:here']).toBeGreaterThan(6 * HOUR);
    // The player's entry outlives its expiry while the gatherer may still scan over it.
    expect(pruneExpired(withCollected, 100 * HOUR).collected['taken:node:here']).toBe(20 * HOUR);
    expect(collectedKeepFrom(withCollected, 100 * HOUR)).toBe(6 * HOUR);
    // Without a gatherer at work, the entry drops as before.
    const idle = { ...withCollected, heroes: withCollected.heroes.map((h) => ({ ...h, job: null })) };
    expect(pruneExpired(idle, 100 * HOUR).collected['taken:node:here']).toBeUndefined();
  });

  it('paces nodes at least minutesPerNode of working time apart', () => {
    const save = camped();
    const { nodes } = gathererFinds(save, 'gatherer', 0, 24 * HOUR);
    const worker = hero(save);
    const paceHours = gathererRules.minutesPerNode / 60;
    for (let i = 1; i < nodes.length; i++) {
      const worked = workDone(worker, cycleAt(worker, nodes[i].at)) - workDone(worker, cycleAt(worker, nodes[i - 1].at));
      expect(worked).toBeGreaterThanOrEqual(paceHours - 1e-9);
    }
  });

  it('says when the output fills, counting the nodes found since the last settle', () => {
    const save = camped();
    const at = fullAt(save, 'gatherer', 2 * HOUR);
    if (at === null) {
      expect(jobOutputNow(save, 'gatherer', 30 * HOUR)).toBeLessThan(gathererCapNodes());
      return;
    }
    expect(jobOutputNow(save, 'gatherer', at)).toBe(gathererCapNodes());
    expect(jobOutputNow(save, 'gatherer', at - 1)).toBeLessThan(gathererCapNodes());
    expect(fullAt(settleJobs(save, 2 * HOUR), 'gatherer', 2 * HOUR)).toBe(at);
  });

  it('fills to its node cap and resumes after a collect', () => {
    expect(jobCap('gatherer')).toBe(gathererCapNodes());
    expect(gathererCapNodes()).toBe(24);
    let save = camped();
    for (const hours of [6, 12, 18, 24, 30, 36, 48]) {
      save = settleJobs(save, hours * HOUR);
      expect(save.jobOutput.gatherer!.nodes ?? 0).toBeLessThanOrEqual(gathererCapNodes());
      expect(jobOutputNow(save, 'gatherer', hours * HOUR)).toBeLessThanOrEqual(gathererCapNodes());
      if (isJobFull(save, 'gatherer', hours * HOUR)) {
        expect(fullAt(save, 'gatherer', hours * HOUR)).toBeNull();
      }
      save = collectJob(save, 'gatherer', hours * HOUR);
      expect(save.jobOutput.gatherer!.nodes).toBe(0);
      expect(save.jobOutput.gatherer!.wounds).toEqual([]);
    }
    const resumed = settleJobs(save, 60 * HOUR);
    expect(resumed.jobOutput.gatherer!.nodes ?? 0).toBeGreaterThan(0);
  });

  it('takes nothing while the tutorial still hides the map kinds', () => {
    const save = assignJob(createInitialSave('seed'), 'bram', 'gatherer', 0, CAMP);
    expect(gathererFinds(save, 'gatherer', 0, 24 * HOUR).nodes).toEqual([]);
  });

  it('takes no ore a pickaxe could not open', () => {
    // No pickaxe: plain stone may be taken, but locked nodes never.
    const save = camped();
    const { nodes } = gathererFinds(save, 'gatherer', 0, 24 * HOUR);
    for (const node of nodes.filter((n) => n.spawn.kind === 'ore')) {
      expect(canGather(save, node.spawn)).toBe(true);
      expect(node.spawn.resourceId).toBe('stone');
    }
  });

  it('gathers nothing while the worker rests after being assigned at 0 energy, then resumes', () => {
    const empty = { ...base(), heroes: base().heroes.map((h) => (h.id === 'bram' ? { ...h, energy: { value: 0, at: 0 } } : h)) };
    const save = assignJob(empty, 'bram', 'gatherer', 0, CAMP);
    expect(hero(save).job!.tired).toBe(true);
    expect(gathererFinds(save, 'gatherer', 0, 6 * HOUR).nodes).toEqual([]);
    expect(gathererFinds(save, 'gatherer', 0, 12 * HOUR).nodes.length).toBeGreaterThan(0);
  });

  it('wounds the worker at about the wound chance, and never below 1 HP', () => {
    /** Two weeks of settling and collecting: the count of nodes taken and wounds taken. */
    const loop = (): { wounds: number; nodes: number } => {
      let next = camped();
      let taken = 0;
      let hurt = 0;
      for (let hours = 6; hours <= 6 * 24 * 14; hours += 6) {
        next = settleJobs(next, hours * HOUR);
        const entry = next.jobOutput.gatherer!;
        taken += entry.nodes ?? 0;
        hurt += entry.wounds?.length ?? 0;
        const worker = next.heroes.find((h) => h.id === 'bram')!;
        expect(currentHp(next, worker, hours * HOUR)).toBeGreaterThanOrEqual(1 - 1e-9);
        next = collectJob(next, 'gatherer', hours * HOUR);
      }
      return { wounds: hurt, nodes: taken };
    };
    const once = loop();
    expect(once.nodes).toBeGreaterThanOrEqual(300);
    const rate = once.wounds / once.nodes;
    expect(rate).toBeGreaterThan(0.005);
    expect(rate).toBeLessThan(0.07);
    // The same save and times give the same wounds again.
    expect(loop()).toEqual(once);
  });

  it('gives the same results for the same save and time', () => {
    const save = camped();
    const scan = () => ({
      finds: gathererFinds(save, 'gatherer', 0, 24 * HOUR),
      detail: jobOutputDetail(save, 'gatherer', 12 * HOUR),
      settled: settleJobs(save, 12 * HOUR),
    });
    expect(scan()).toEqual(scan());
  });

  it('settles a save left for three days quickly', () => {
    const save = camped();
    const at = 72 * HOUR;
    settleJobs(save, at); // warm
    jobOutputDetail(save, 'gatherer', at);
    const started = Date.now();
    const detail = jobOutputDetail(save, 'gatherer', at);
    const detailMs = Date.now() - started;
    const settledStarted = Date.now();
    settleJobs(save, at);
    const settledMs = Date.now() - settledStarted;
    expect(detail.units).toBeGreaterThanOrEqual(0);
    expect(detailMs).toBeLessThan(50);
    expect(settledMs).toBeLessThan(50);
  });
});
