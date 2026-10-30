import type { PlaceKind } from '@/content/places';

import { distanceMeters, offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from '../places/generate';
import { createInitialSave, type SaveData } from '../save';
import { objectiveAmount } from './unlocks';
import { acceptQuests, compassDirection, nearestInBand, retargetQuests, targetDistance } from './targets';
import type { Quest } from './types';

const DAY = 86_400_000;

const origin: LatLng = { latitude: 51.5, longitude: -0.12 };

const opened = (): SaveData => {
  const save = createInitialSave();
  save.tutorial.step = 'done';
  save.seenPlaceKinds = ['chapel', 'library', 'market'];
  return save;
};

const spawn = (id: string, kind: PlaceKind, meters: number, expiresAt = 5 * DAY): PlaceSpawn => ({
  id,
  kind,
  group: kind,
  tile: 'test',
  position: offsetPosition(origin, meters, 0),
  startsAt: 0,
  expiresAt,
  roll: 0,
});

const quest = (objective: Quest['objective'], band: Quest['band'] = 'short', overrides: Partial<Quest> = {}): Quest => ({
  id: 'q|10|0',
  objective,
  band,
  arrivedAt: 0,
  expiresAt: 2 * DAY,
  acceptedAt: null,
  amount: band === 'secret' ? 1 : objectiveAmount(objective, band),
  progress: 0,
  target: null,
  doneAt: null,
  seen: false,
  ...overrides,
});

describe('quest targets', () => {
  it('picks the nearest live place of the kind inside the band range', () => {
    const candidates = [spawn('far', 'chapel', 400), spawn('near', 'chapel', 200), spawn('dead', 'chapel', 100, 1)];
    expect(nearestInBand(candidates, ['chapel'], origin, 'short', 2, {})?.id).toBe('near');
    expect(nearestInBand([], ['chapel'], origin, 'short', 2, {})).toBe(null);
    expect(nearestInBand(candidates, ['library'], origin, 'short', 2, {})).toBe(null);
    expect(nearestInBand(candidates, ['chapel'], origin, 'short', 2, { near: DAY })?.id).toBe('far');
  });

  it('skips places below the band minimum and never goes past 2000 m', () => {
    const low = [spawn('low', 'chapel', 300), spawn('in', 'chapel', 700)];
    expect(nearestInBand(low, ['chapel'], origin, 'medium', 2, {})?.id).toBe('in');
    const onlyLow = [spawn('low', 'chapel', 300)];
    expect(nearestInBand(onlyLow, ['chapel'], origin, 'medium', 2, {})).toBe(null);
    const long = [spawn('edge', 'chapel', 1500), spawn('past', 'chapel', 2500)];
    expect(nearestInBand(long, ['chapel'], origin, 'long', 2, {})?.id).toBe('edge');
    expect(nearestInBand([spawn('past', 'chapel', 2500)], ['chapel'], origin, 'long', 2, {})).toBe(null);
  });

  it('accepts a quest with its target, nearest first', () => {
    const save = opened();
    save.quests.list = [quest('chapel')];
    const candidates = [spawn('far', 'chapel', 400), spawn('near', 'chapel', 150)];
    const next = acceptQuests(save, candidates, origin, 100);
    const accepted = next.quests.list[0];
    expect(accepted.acceptedAt).toBe(100);
    expect(accepted.target?.placeId).toBe('near');
    expect(accepted.target?.from).toEqual(origin);
    expect(targetDistance(accepted, origin)).toBeCloseTo(150, -1);
  });

  it('records the step count for walk quests and needs no place', () => {
    const save = opened();
    save.stepsTotal = 1234;
    save.quests.list = [quest('walk', 'medium')];
    const next = acceptQuests(save, [], origin, 100);
    expect(next.quests.list[0].stepsAtAccept).toBe(1234);
    expect(next.quests.list[0].target).toBe(null);
  });

  it('swaps to another objective when nothing is in range', () => {
    const save = opened();
    save.quests.list = [quest('chapel')];
    // No chapels at all: the quest must end up on something it can do.
    const next = acceptQuests(save, [spawn('market', 'market', 150)], origin, 100);
    const accepted = next.quests.list[0];
    expect(accepted.objective).not.toBe('chapel');
    expect(accepted.target === null || accepted.target.kind === 'market').toBe(true);
    expect(['gatherOnWay', 'walk', 'patrols', 'fightEvent']).toContain(accepted.objective);
  });

  it('retargets from where the target was fixed, staying in band', () => {
    const save = opened();
    const withTarget = quest('chapel', 'short', {
      acceptedAt: 100,
      target: { placeId: 'gone', kind: 'chapel', position: offsetPosition(origin, 400, 0), from: origin, expiresAt: 1000 },
    });
    save.quests.list = [withTarget];
    const fresh = [spawn('new', 'chapel', 450), spawn('out', 'chapel', 800)];
    const next = retargetQuests(save, fresh, 2000);
    expect(next.quests.list[0].target?.placeId).toBe('new');
    expect(next.quests.list[0].target?.from).toEqual(origin);

    const none = retargetQuests(save, [spawn('out', 'chapel', 800)], 2000);
    expect(none.quests.list[0].target).toBe(null);
  });

  it('leaves accepted quests alone while their target lives', () => {
    const save = opened();
    save.quests.list = [
      quest('chapel', 'short', {
        acceptedAt: 100,
        target: { placeId: 'live', kind: 'chapel', position: origin, from: origin, expiresAt: 5 * DAY },
      }),
      quest('chapel'), // not accepted yet
    ];
    const next = retargetQuests(save, [spawn('other', 'chapel', 100)], 2000);
    expect(next.quests.list[0].target?.placeId).toBe('live');
    expect(next.quests.list[1].target).toBe(null);
  });

  it('fixes a secret quest mark 300–500 m away', () => {
    const save = opened();
    save.quests.list = [quest('mark', 'secret')];
    const next = acceptQuests(save, [], origin, 100);
    const target = next.quests.list[0].target;
    expect(target?.kind).toBe('mark');
    expect(target?.placeId).toBe('mark:q|10|0');
    expect(target?.expiresAt).toBe(next.quests.list[0].expiresAt);
    const distance = distanceMeters(origin, target!.position);
    expect(distance).toBeGreaterThanOrEqual(300);
    expect(distance).toBeLessThanOrEqual(500);
  });

  it('gives compass directions', () => {
    expect(compassDirection(origin, offsetPosition(origin, 100, 0))).toBe('N');
    expect(compassDirection(origin, offsetPosition(origin, 0, 100))).toBe('E');
    expect(compassDirection(origin, offsetPosition(origin, -100, -100))).toBe('SW');
  });
});
