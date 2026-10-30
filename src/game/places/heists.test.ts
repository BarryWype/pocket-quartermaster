import { dungeons } from '@/content/dungeons';
import { heistRules } from '@/content/placeActivities';
import { secretRules } from '@/content/secrets';

import type { LatLng } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import { rollTip } from '../secrets/tips';
import { isAway } from '../team/team';
import { emptyLoot } from '../loot/types';
import type { PlaceSpawn } from './generate';
import { heistLevel, heistOdds, heistProblem, heistScore, resolveHeists, startHeist } from './heists';
import type { Heist } from '../types';

const position: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const far: LatLng = { latitude: -41.29, longitude: 174.7762 };
const now = 0;

const spawnOf = (suffix = '0:1'): PlaceSpawn => ({
  id: `place:thievesGuild:tile:${suffix}`,
  kind: 'thievesGuild',
  group: 'thievesGuild',
  tile: 'tile',
  position,
  startsAt: 0,
  expiresAt: 1e15,
  roll: 0,
});

/** A save whose heroes are all the given class, with the tier bosses cleared up to `tier`. */
const saveOf = (classId: string, tier = 1): SaveData => ({
  ...createInitialSave(),
  heroes: createInitialSave().heroes.map((hero) => ({ ...hero, classId: classId as SaveData['heroes'][number]['classId'] })),
  clearedDungeons: tier > 1 ? dungeons.filter((d) => d.isBoss && d.tier < tier).map((d) => d.id) : [],
});

const reward = { ...emptyLoot(), gold: 120 };

const heistOf = (over: Partial<Heist> = {}): Heist => ({
  id: 'heist9',
  placeId: spawnOf().id,
  heroId: 'bram',
  startedAt: 0,
  endsAt: 60_000,
  success: true,
  reward,
  ...over,
});

describe('heistScore', () => {
  it('rides on Finesse: a thief meets the locks, a warrior has to force them or fails', () => {
    expect(heistScore(saveOf('thief'), 'bram')).toBe('met');
    // A warrior's Might (3) covers the level 1 need (2), so the lock is forced open.
    expect(heistScore(saveOf('warrior'), 'bram')).toBe('met');
    // At tier 5 the locks need 4: the warrior is short everywhere, the thief still meets them.
    expect(heistLevel(saveOf('thief', 5))).toBe(3);
    expect(heistScore(saveOf('warrior', 5), 'bram')).toBe('full');
    expect(heistScore(saveOf('thief', 5), 'bram')).toBe('met');
  });

  it('follows the tier: levels 1, 1, 2, 2, 3', () => {
    expect(heistLevel(saveOf('thief', 1))).toBe(1);
    expect(heistLevel(saveOf('thief', 2))).toBe(1);
    expect(heistLevel(saveOf('thief', 3))).toBe(2);
    expect(heistLevel(saveOf('thief', 4))).toBe(2);
    expect(heistLevel(saveOf('thief', 5))).toBe(3);
  });

  it('turns the score into the success chance', () => {
    expect(heistOdds(saveOf('thief'), 'bram')).toBe(heistRules.successChance.met);
    expect(heistOdds(saveOf('warrior', 5), 'bram')).toBe(heistRules.successChance.full);
  });
});

describe('startHeist', () => {
  it('sends the hero away for the rolled minutes, and frees them at resolution', () => {
    const save = startHeist(saveOf('thief'), spawnOf(), 'bram', position, now);
    const [heist] = save.heists;
    expect(heist.heroId).toBe('bram');
    expect(heist.id).toBe('heist1');
    expect(heist.endsAt - heist.startedAt).toBeGreaterThanOrEqual(heistRules.minutes[0] * 60_000);
    expect(heist.endsAt - heist.startedAt).toBeLessThanOrEqual(heistRules.minutes[1] * 60_000);
    expect(isAway(save, 'bram')).toBe(true);
    const { save: settled } = resolveHeists(save, heist.endsAt);
    expect(settled.heists).toEqual([]);
    expect(isAway(settled, 'bram')).toBe(false);
  });

  it('pays a success and nothing for a failure', () => {
    const won = resolveHeists({ ...createInitialSave(), heists: [heistOf({ success: true })] }, 120_000).save;
    expect(won.gold).toBe(120);
    const lost = resolveHeists({ ...createInitialSave(), heists: [heistOf({ success: false })] }, 120_000).save;
    expect(lost.gold).toBe(0);
  });

  it('keeps a heist that is still under way', () => {
    const save = { ...createInitialSave(), heists: [heistOf({ endsAt: 60_000 })] };
    expect(resolveHeists(save, 30_000).resolved).toEqual([]);
    expect(resolveHeists(save, 30_000).save.heists).toHaveLength(1);
  });

  it('refuses what the player cannot do from here', () => {
    expect(heistProblem(saveOf('thief'), { ...spawnOf('1:1'), kind: 'market' }, 'bram', position, now)).toBe('gone');
    expect(heistProblem(saveOf('thief'), { ...spawnOf('1:2'), startsAt: 100 }, 'bram', position, now)).toBe('gone');
    expect(heistProblem(saveOf('thief'), { ...spawnOf('1:3'), expiresAt: -1 }, 'bram', position, now)).toBe('gone');
    expect(heistProblem(saveOf('thief'), spawnOf('1:4'), 'bram', far, now)).toBe('tooFar');
    const away = startHeist(saveOf('thief'), spawnOf(), 'bram', position, now);
    expect(heistProblem(away, spawnOf('1:5'), 'bram', position, now)).toBe('away');
    // A heist already running at this place hides it.
    expect(heistProblem(away, spawnOf(), 'lyra', position, now)).toBe('gone');
    const exhausted = { ...saveOf('thief'), heroes: [{ ...saveOf('thief').heroes[0], exhaustedUntil: 60_000 }] };
    expect(heistProblem(exhausted, spawnOf('1:6'), 'bram', position, now)).toBe('exhausted');
  });
});

describe('heist tips', () => {
  it('grants a successful heist its tip on resolve', () => {
    let started: SaveData | null = null;
    let heist: Heist | undefined;
    for (let i = 1; i < 300; i++) {
      const candidate = startHeist({ ...saveOf('thief'), nextUid: i }, spawnOf(), 'bram', position, now);
      const run = candidate.heists[0];
      if (run.success && run.tip) {
        started = candidate;
        heist = run;
        break;
      }
    }
    if (!started || !heist) throw new Error('No heist both succeeding and tipping');
    expect(rollTip('heist', heist.id)).toBe(true);
    const { save: done, tips } = resolveHeists(started, heist.endsAt);
    expect(tips).toEqual([{ kind: 'tip', tip: expect.objectContaining({ secret: secretRules.tips.heist.secret, source: 'heist', sourceId: heist.id }) }]);
    expect(done.secretTips[0].source).toBe('heist');
  });

  it('never tips a failed heist', () => {
    for (let i = 1; i < 300; i++) {
      const started = startHeist({ ...saveOf('warrior', 5), nextUid: i }, spawnOf(), 'bram', position, now);
      const heist = started.heists[0];
      if (heist.success) continue;
      expect(heist.tip).toBeUndefined();
      expect(resolveHeists(started, heist.endsAt).tips).toEqual([]);
      return;
    }
    throw new Error('No failing heist found');
  });
});
