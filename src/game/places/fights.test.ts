import { placeFightRules } from '@/content/placeFights';
import { placeRewardTables } from '@/content/placeRewards';
import { patrolRules } from '@/content/patrols';
import type { PlaceKind } from '@/content/places';

import { offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import { tileAt } from '../generation/tiles';
import { setHeroHp } from '../team/health';
import { isAway } from '../team/team';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from './generate';
import { generateTilePatrols, patrolsAround } from '../patrols/generate';
import { HOME, tierTeam } from '../patrols/testHelpers';
import { grantPlaceReward } from './grant';
import { placeFightBriefing, placeFightDungeon, placeFightProblem, resolvePlaceFights, rollPlaceReward, riftElement, startPlaceFight } from './fights';

const HOUR_MS = 3_600_000;
const now = Date.UTC(2026, 9, 26, 12);

const spawnOf = (kind: PlaceKind, position: LatLng = HOME): PlaceSpawn => ({
  id: `place:${kind}:t:0:0`,
  kind,
  group: kind === 'monsterLair' ? 'monsterLair' : 'fightEvents',
  tile: 't',
  position,
  startsAt: now - HOUR_MS,
  expiresAt: now + 12 * HOUR_MS,
  roll: 0,
});

const context = { goldMultiplier: 1, luck: 0, pickaxeTier: 0 };

describe('place fight briefings', () => {
  it('carries the configured threat, and a caravan picks one per spawn', () => {
    expect(placeFightBriefing(tierTeam(), spawnOf('hauntedCrypt')).threats[0].id).toBe('undead');
    const caravan = spawnOf('abandonedCaravan');
    const briefing = placeFightBriefing(tierTeam(), caravan);
    expect(briefing.threats).toHaveLength(1);
    expect((placeFightRules.kinds.abandonedCaravan.threat as string[]).includes(briefing.threats[0].id)).toBe(true);
    expect(placeFightBriefing(tierTeam(), caravan).threats).toEqual(briefing.threats);
  });

  it('builds a rift briefing around the rift element', () => {
    const rift = spawnOf('elementalRift');
    const briefing = placeFightBriefing(tierTeam(), rift);
    expect(briefing.threats[0].id).toBe('element');
    expect(briefing.threats[0].element).toBe(riftElement(rift));
    expect(placeFightDungeon(rift, 1).boss.element).toBe(riftElement(rift));
  });
});

describe('place fight problems', () => {
  it('takes only home heroes who are not exhausted, close enough, within the party size', () => {
    const save = tierTeam();
    const crypt = spawnOf('hauntedCrypt');
    expect(placeFightProblem(save, crypt, ['bram'], HOME, now)).toBeNull();
    expect(placeFightProblem(save, crypt, ['bram'], offsetPosition(HOME, 100, 0), now)).toBe('tooFar');
    expect(placeFightProblem(save, crypt, [], HOME, now)).toBe('empty');
    expect(placeFightProblem(save, crypt, ['bram', 'lyra', 'mira', 'x'], HOME, now)).toBe('partySize');
    expect(placeFightProblem(save, spawnOf('monsterLair'), ['bram'], HOME, now)).toBe('partySize');
    expect(placeFightProblem(setHeroHp(save, 'bram', 0, now, true), crypt, ['bram'], HOME, now)).toBe('exhausted');
    const started = startPlaceFight(save, crypt, ['bram'], HOME, now);
    // The same place is gone (a fight runs there); the hero is away elsewhere.
    expect(placeFightProblem(started, crypt, ['bram'], HOME, now)).toBe('gone');
    expect(placeFightProblem(started, spawnOf('banditCamp'), ['bram'], HOME, now)).toBe('away');
  });
});

describe('fighting at a place', () => {
  it('sends the heroes away and pays the win when the fight is up', () => {
    const save = tierTeam();
    const crypt = spawnOf('hauntedCrypt');
    const started = startPlaceFight(save, crypt, ['bram', 'lyra', 'mira'], HOME, now);
    const fight = started.placeFights[0];
    expect(fight.endsAt).toBe(now + placeFightRules.kinds.hauntedCrypt.minutes * 60_000);
    expect(isAway(started, 'bram')).toBe(true);

    const { save: done, resolved } = resolvePlaceFights(started, fight.endsAt);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].won).toBe(true);
    expect(done.placeFights).toHaveLength(0);
    expect(done.gold).toBeGreaterThan(save.gold);
    expect(done.usedPlaces[crypt.id]).toBe(crypt.expiresAt);
    expect(isAway(done, 'bram')).toBe(false);
    expect(placeFightProblem(done, crypt, ['bram'], HOME, now)).toBe('gone');
  });

  it('leaves the place on the map after a lost fight', () => {
    const weak = setHeroHp(tierTeam(), 'mira', 0.02, now, false);
    const camp = spawnOf('banditCamp');
    const { save: done, resolved } = resolvePlaceFights(startPlaceFight(weak, camp, ['mira'], HOME, now), now + 15 * 60_000);
    expect(resolved[0].won).toBe(false);
    expect(done.usedPlaces[camp.id]).toBeUndefined();
    expect(done.gold).toBe(weak.gold);
  });

  it('grants reward gear with fresh uids and recipe unlocks', () => {
    const save = tierTeam();
    const rewarded = grantPlaceReward(save, [], {
      gold: 10,
      xp: 0,
      materials: [{ materialId: 'fireShard', amount: 2 }],
      consumables: [{ itemId: 'healingPotion', amount: 2 }],
      gear: [{ uid: 'reward', itemId: 'sword1', quality: 'rare', roll: 1 }],
      keyFragments: 1,
    });
    expect(rewarded.gold).toBe(save.gold + 10);
    expect(rewarded.gear.at(-1)).toMatchObject({ uid: `g${save.nextUid}`, itemId: 'sword1' });
    expect(rewarded.nextUid).toBe(save.nextUid + 1);
    expect(rewarded.consumables.healingPotion).toBe((save.consumables.healingPotion ?? 0) + 2);
    expect(rewarded.keyFragments).toBe(1);
  });
});

describe('place rewards', () => {
  it('is deterministic for a given rng', () => {
    const table = placeRewardTables.monsterLair!;
    const once = rollPlaceReward(table, context, 2, createRng('r'), tierTeam());
    expect(rollPlaceReward(table, context, 2, createRng('r'), tierTeam())).toEqual(once);
  });

  it('sometimes gives a key fragment at a crypt', () => {
    const table = placeRewardTables.hauntedCrypt!;
    const fragments = Array.from({ length: 200 }, (_, i) => rollPlaceReward(table, context, 1, createRng(`k${i}`), tierTeam()).keyFragments);
    expect(fragments.some((f) => f === 1)).toBe(true);
    expect(fragments.some((f) => f === 0)).toBe(true);
  });

  it('gives a rift its element in shards', () => {
    const reward = rollPlaceReward(placeRewardTables.elementalRift!, context, 1, createRng('r'), tierTeam(), 'fire');
    expect(reward.materials).toEqual([{ materialId: 'fireShard', amount: expect.any(Number) }]);
    expect(reward.materials[0].amount).toBeGreaterThanOrEqual(2);
    expect(reward.materials[0].amount).toBeLessThanOrEqual(4);
  });
});

describe('lair patrol boost', () => {
  const tile = tileAt(HOME, patrolRules.precision);

  it('spawns more patrols in a boosted tile, and leaves others untouched', () => {
    const windows = Array.from({ length: 300 }, (_, w) => w);
    const count = (boosted: boolean) => windows.reduce((sum, w) => sum + generateTilePatrols(tile, w, patrolRules, boosted).length, 0);
    expect(count(true)).toBeGreaterThan(count(false) * 1.15);
    for (const w of windows.slice(0, 20)) {
      expect(generateTilePatrols(tile, w, patrolRules, false)).toEqual(generateTilePatrols(tile, w, patrolRules));
    }
  });

  it('spawns more patrols around a lair over many windows', () => {
    const total = (lairs: LatLng[]) =>
      Array.from({ length: 200 }, (_, w) => patrolsAround(HOME, now + w * 30 * 60_000, patrolRules, lairs).length).reduce((a, b) => a + b, 0);
    const plain = total([]);
    expect(total([HOME])).toBeGreaterThan(plain);
    // A lair far away boosts nothing.
    expect(total([offsetPosition(HOME, 50_000, 0)])).toBe(plain);
  });
});
