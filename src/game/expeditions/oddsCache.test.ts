import { startingHeroes } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';

import { composeBriefing } from '../threats/compose';
import { rotationDay } from '../dungeons/rotation';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { Briefing } from '../types';
import * as odds from './odds';
import { cachedEstimateOdds, cachedOdds, oddsKey } from './oddsCache';

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
