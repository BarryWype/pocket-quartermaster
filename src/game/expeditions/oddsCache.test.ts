import { startingHeroes } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';

import { composeBriefing } from '../threats/compose';
import { rotationDay } from '../dungeons/rotation';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { Briefing } from '../types';
import * as odds from './odds';
import { isFightPlace, placeFightOdds } from '../places/fights';
import { placesAround } from '../places/generate';
import { isPatrolKind, patrolsAround } from '../patrols/generate';
import { cachedEstimateOdds, cachedOdds, fightOddsKey, oddsKey, storeOdds } from './oddsCache';

const ALL = startingHeroes.map((h) => h.id);
const DAY = rotationDay(0);

/** The starting heroes at a level, in a tier's weapons and armour (Normal), each with a healing potion. */
function team(tier: number, level: number): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'],
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    consumables: { ...createInitialSave().consumables, healingPotion: 3 },
    gear: ALL.flatMap((_, i) => [
      { uid: `w${i}`, itemId: `sword${tier}`, quality: 'normal' as const },
      { uid: `a${i}`, itemId: `mail${tier}`, quality: 'normal' as const },
    ]),
  };
  ALL.forEach((id, i) => {
    save = equip(equip(equip(save, id, 'weapon', `w${i}`), id, 'armor', `a${i}`), id, 'consumable', 'healingPotion');
  });
  return save;
}

/** A tier-2 party of three with a briefing, as the Expeditions screen would show it. */
function setup() {
  const save = team(2, 3);
  const party = ALL.slice(0, 3);
  const dungeon = dungeonById.ogreQuarry;
  const briefing: Briefing = composeBriefing(dungeon, DAY);
  return { save, party, dungeon, briefing };
}

describe('odds cache', () => {
  // The spies must not leak between tests, and the estimate itself is the real one.
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the cached odds for the same inputs, without recomputing', () => {
    const { save, party, dungeon, briefing } = setup();
    const spy = jest.spyOn(odds, 'estimateOdds');
    const first = cachedEstimateOdds(save, party, dungeon, undefined, { now: 300_000, briefing });
    expect(spy).toHaveBeenCalledTimes(1);
    const second = cachedEstimateOdds(save, party, dungeon, undefined, { now: 300_000, briefing });
    expect(second).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cachedOdds(oddsKey({ save, heroIds: party, dungeon, options: { now: 300_000, briefing } }))).toBe(first);
  });

  it('recomputes when the HP minute, the party, the gear or the briefing changes', () => {
    const { save, party, dungeon, briefing } = setup();
    const spy = jest.spyOn(odds, 'estimateOdds');
    cachedEstimateOdds(save, party, dungeon, undefined, { now: 600_000, briefing });
    expect(spy).toHaveBeenCalledTimes(1);
    // A later minute: the heroes have healed.
    cachedEstimateOdds(save, party, dungeon, undefined, { now: 660_000, briefing });
    expect(spy).toHaveBeenCalledTimes(2);
    // A different party.
    cachedEstimateOdds(save, ALL.slice(1), dungeon, undefined, { now: 600_000, briefing });
    expect(spy).toHaveBeenCalledTimes(3);
    // A different briefing.
    cachedEstimateOdds(save, party, dungeon, undefined, { now: 600_000, briefing: { threats: [], restriction: null, opportunity: null } });
    expect(spy).toHaveBeenCalledTimes(4);
    // A reforged weapon.
    const rearmed = { ...save, gear: save.gear.map((g) => (g.uid === 'w0' ? { ...g, quality: 'rare' as const } : g)) };
    cachedEstimateOdds(rearmed, party, dungeon, undefined, { now: 600_000, briefing });
    expect(spy).toHaveBeenCalledTimes(5);
    // A hero's stored HP changes (a run applied it).
    const hurt = { ...save, heroes: save.heroes.map((h) => (h.id === party[0] ? { ...h, hp: 1, hpAt: 600_000 } : h)) };
    cachedEstimateOdds(hurt, party, dungeon, undefined, { now: 600_000, briefing });
    expect(spy).toHaveBeenCalledTimes(6);
    // The same minute of another hour still recomputes (HP is a live value, not a cache of hours).
    cachedEstimateOdds(save, party, dungeon, undefined, { now: 60_000 * 60 + 600_000, briefing });
    expect(spy).toHaveBeenCalledTimes(7);
  });

  it('does not recompute on unrelated save writes', () => {
    const { save, party, dungeon, briefing } = setup();
    const spy = jest.spyOn(odds, 'estimateOdds');
    cachedEstimateOdds(save, party, dungeon, undefined, { now: 900_000, briefing });
    expect(spy).toHaveBeenCalledTimes(1);
    const touched: SaveData[] = [
      { ...save, gold: save.gold + 500 },
      { ...save, materials: { ...save.materials, ironIngot: (save.materials.ironIngot ?? 0) + 3 } },
      { ...save, steps: { day: '2026-11-02', count: 4000 } },
      {
        ...save,
        expeditions: [
          {
            id: 'x9',
            dungeonId: dungeon.id,
            heroIds: [party[0]],
            startedAt: 0,
            endsAt: 1000,
            seed: 'x9:0',
            notificationId: null,
          },
        ],
      },
    ];
    const key = oddsKey({ save, heroIds: party, dungeon, options: { now: 900_000, briefing } });
    for (const next of touched) {
      expect(oddsKey({ save: next, heroIds: party, dungeon, options: { now: 900_000, briefing } })).toBe(key);
    }
    cachedEstimateOdds(touched[0], party, dungeon, undefined, { now: 900_000, briefing });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('fight odds cache (the map panels)', () => {
  const NOW = 1_800_000_000_000;
  const POSITION = { latitude: -41.2865, longitude: 174.7762 };
  const party = ALL.slice(0, 3);

  /** A fight place and a patrol, as the map would show them. */
  function spawns() {
    const save = team(3, 5);
    const place = placesAround(POSITION, NOW).find((spawn) => isFightPlace(spawn.kind))!;
    const patrol = patrolsAround(POSITION, NOW).find((spawn) => isPatrolKind(spawn.kind))!;
    return { save, place, patrol };
  }

  it('keys a place fight by its place, party and minute', () => {
    const { save, place } = spawns();
    const first = fightOddsKey(save, party, place, 3, false, NOW);
    expect(fightOddsKey(save, party, place, 3, false, NOW)).toBe(first);
    // A later minute: the heroes have healed.
    expect(fightOddsKey(save, party, place, 3, false, NOW + 60_000)).not.toBe(first);
    // A different party or tier.
    expect(fightOddsKey(save, ALL.slice(1), place, 3, false, NOW)).not.toBe(first);
    expect(fightOddsKey(save, party, place, 4, false, NOW)).not.toBe(first);
    // A different place of the same kind.
    const other = { ...place, id: 'other', position: { latitude: -41.2, longitude: 174.8 } };
    expect(fightOddsKey(save, party, other, 3, false, NOW)).not.toBe(first);
  });

  it('keys a patrol by its tier roll as well', () => {
    const { save, patrol } = spawns();
    const first = fightOddsKey(save, party, patrol, 3, false, NOW);
    expect(fightOddsKey(save, party, { ...patrol, tierRoll: 'elite' }, 3, true, NOW)).not.toBe(first);
    expect(fightOddsKey(save, party, { ...patrol, tierRoll: 'below' }, 2, false, NOW)).not.toBe(first);
  });

  it('does not recompute on unrelated save writes', () => {
    const { save, place, patrol } = spawns();
    const placeKey = fightOddsKey(save, party, place, 3, false, NOW);
    const patrolKey = fightOddsKey(save, party, patrol, 3, false, NOW);
    const touched: SaveData[] = [
      { ...save, gold: save.gold + 500 },
      { ...save, materials: { ...save.materials, ironIngot: (save.materials.ironIngot ?? 0) + 3 } },
      { ...save, steps: { day: '2026-11-02', count: 4000 } },
      { ...save, placeFights: [{ ...save.placeFights[0] ?? { id: 'f1', placeId: 'p1', kind: 'beastDen', tier: 3, heroIds: party, startedAt: 0, endsAt: 1, placeExpiresAt: 2, won: true, hp: {}, salvaged: [] } }] },
    ];
    for (const next of touched) {
      expect(fightOddsKey(next, party, place, 3, false, NOW)).toBe(placeKey);
      expect(fightOddsKey(next, party, patrol, 3, false, NOW)).toBe(patrolKey);
    }
  });

  it('stores and returns the odds for a fight key', () => {
    const { save, place } = spawns();
    const key = fightOddsKey(save, party, place, 3, false, NOW);
    expect(cachedOdds(key)).toBeUndefined();
    const odds = placeFightOdds(save, place, party, NOW);
    storeOdds(key, odds);
    expect(cachedOdds(key)).toBe(odds);
  });
});
