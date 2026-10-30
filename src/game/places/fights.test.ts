import { monsterPartById } from '@/content/lookup';
import { placeFightRules } from '@/content/placeFights';
import { patrolRules } from '@/content/patrols';
import { secretRules } from '@/content/secrets';
import type { PlaceKind } from '@/content/places';

import { offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import { tileAt } from '../generation/tiles';
import { grantLoot } from '../loot/grant';
import { emptyLoot } from '../loot/types';
import { rollTip } from '../secrets/tips';
import { setHeroHp } from '../team/health';
import { isAway } from '../team/team';
import type { LatLng } from '../generation/types';
import type { PlaceFight } from '../types';
import type { PlaceSpawn } from './generate';
import { generateTilePatrols, patrolsAround } from '../patrols/generate';
import { HOME, tierTeam } from '../patrols/testHelpers';
import { placeFightBriefing, placeFightDungeon, placeFightProblem, placeLoot, resolvePlaceFights, riftElement, startPlaceFight } from './fights';

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
    expect(done.gold).toBe(save.gold + fight.reward.gold);
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

  it('grants reward gear with fresh uids', () => {
    const save = tierTeam();
    const rewarded = grantLoot(save, [], {
      ...emptyLoot(),
      gold: 10,
      gear: [{ uid: '', itemId: 'sword1', quality: 'rare', roll: 1 }],
      keyFragments: 1,
    }, now);
    expect(rewarded.gold).toBe(save.gold + 10);
    expect(rewarded.gear.at(-1)).toMatchObject({ uid: `g${save.nextUid}`, itemId: 'sword1' });
    expect(rewarded.nextUid).toBe(save.nextUid + 1);
    expect(rewarded.keyFragments).toBe(1);
  });

  it('grants a won camp or lair its tip on resolve, never a lost fight', () => {
    for (const kind of ['banditCamp', 'monsterLair'] as const) {
      let started: ReturnType<typeof startPlaceFight> | null = null;
      let fight: PlaceFight | undefined;
      for (let i = 0; i < 200; i++) {
        const spawn = { ...spawnOf(kind), id: `place:${kind}:t:${i}:0` };
        const run = startPlaceFight(tierTeam(), spawn, ['bram', 'lyra', 'mira'], HOME, now);
        const current = run.placeFights[0];
        if (current.won && current.tip) {
          started = run;
          fight = current;
          break;
        }
      }
      if (!started || !fight) throw new Error(`No won ${kind} tipping the player off`);
      expect(rollTip(kind, fight.placeId)).toBe(true);
      const { save: done, tips } = resolvePlaceFights(started, fight.endsAt);
      expect(tips).toEqual([{ kind: 'tip', tip: expect.objectContaining({ secret: secretRules.tips[kind].secret, source: kind, sourceId: fight.placeId }) }]);
      expect(done.secretTips[0].source).toBe(kind);
    }

    const weak = setHeroHp(tierTeam(), 'mira', 0.02, now, false);
    let lost = false;
    for (let i = 0; i < 200 && !lost; i++) {
      const spawn = { ...spawnOf('banditCamp'), id: `place:banditCamp:t:${i}:0` };
      if (!rollTip('banditCamp', spawn.id)) continue;
      const started = startPlaceFight(weak, spawn, ['mira'], HOME, now);
      const fight = started.placeFights[0];
      expect(fight.tip).toBeUndefined();
      expect(resolvePlaceFights(started, fight.endsAt).tips).toEqual([]);
      lost = true;
    }
    expect(lost).toBe(true);
  });
});

describe('place rewards', () => {
  it('is deterministic for a given rng', () => {
    const once = placeLoot('monsterLair', tierTeam(), 0, [], createRng('r'));
    expect(placeLoot('monsterLair', tierTeam(), 0, [], createRng('r'))).toEqual(once);
  });

  it('sometimes gives a key fragment at a crypt', () => {
    const fragments = Array.from({ length: 200 }, (_, i) =>
      placeLoot('hauntedCrypt', tierTeam(), 0, [], createRng(`k${i}`)).keyFragments,
    );
    expect(fragments.some((f) => f === 1)).toBe(true);
    expect(fragments.some((f) => f === 0)).toBe(true);
  });

  it('gives a rift its element in shards', () => {
    const reward = placeLoot('elementalRift', tierTeam(), 0, [], createRng('r'), 'fire');
    const shards = reward.materials.filter((m) => !monsterPartById[m.materialId]);
    expect(shards).toEqual([{ materialId: 'fireShard', amount: expect.any(Number) }]);
    expect(shards[0].amount).toBeGreaterThanOrEqual(2);
    expect(shards[0].amount).toBeLessThanOrEqual(4);
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
