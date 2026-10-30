import { newHero, startingHeroes } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';

import { composeBriefing } from '../threats/compose';
import { rotationDay } from '../dungeons/rotation';
import { createInitialSave, type SaveData } from '../save';
import { setHeroHp } from '../team/health';
import { equip } from '../team/team';
import { resolveExpedition, startExpedition, type Loadout } from './expeditions';
import { estimateOdds } from './odds';
import * as simulate from './simulate';
import type { Briefing } from '../types';

const ALL = startingHeroes.map((h) => h.id);
const WEAPONS = ['sword', 'bow', 'wand'];
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
      { uid: `w${i}`, itemId: `${WEAPONS[i]}${tier}`, quality: 'normal' as const },
      { uid: `a${i}`, itemId: `mail${tier}`, quality: 'normal' as const },
    ]),
  };
  ALL.forEach((id, i) => {
    save = equip(equip(equip(save, id, 'weapon', `w${i}`), id, 'armor', `a${i}`), id, 'consumable', 'healingPotion');
  });
  return save;
}

describe('odds preview', () => {
  const N = 1000;
  const cases: [string, number, number][] = [
    ['ratCellar', 1, 1],
    ['ogreQuarry', 2, 3],
    ['wolfDen', 2, 3],
    ['drownedCrypt', 3, 5],
  ];
  for (const [dungeonId, tier, level] of cases) {
    it(`matches the real resolution of ${dungeonId} within 5 points, briefing included`, () => {
      const save = team(tier, level);
      const dungeon = dungeonById[dungeonId];
      const briefing = composeBriefing(dungeon, DAY);
      const estimate = estimateOdds(save, ALL, dungeon, N, { briefing }).success;
      let wins = 0;
      for (let i = 0; i < N; i++) {
        const started = startExpedition({ ...save, nextUid: 10_000 + i }, dungeonId, ALL, i * 1000);
        expect(started.expeditions[0].briefing).toEqual(briefing);
        if (resolveExpedition(started, started.expeditions[0]).report.success) wins++;
      }
      expect(Math.abs(estimate - wins / N)).toBeLessThan(0.05);
    });
  }

  /** The same check with hurt heroes, short supply and a meal. */
  const prepared = (): SaveData => {
    let save = team(3, 3);
    save = setHeroHp(save, 'bram', 0.5, 0);
    save = setHeroHp(save, 'mira', 0.7, 0);
    save = { ...save, consumables: { ...save.consumables, trailMix: 1, huntersStew: N, roguesRoll: 1 } };
    return equip(save, 'lyra', 'consumable', 'roguesRoll');
  };
  const loadouts: [string, string, Loadout][] = [
    ['ogreQuarry', 'Hunter’s stew', { mealId: 'huntersStew' }],
    ['millRuins', 'no meal', {}],
  ];
  for (const [dungeonId, what, loadout] of loadouts) {
    it(`matches the real resolution of ${dungeonId} with hurt, underfed heroes and ${what} within 5 points`, () => {
      const save = { ...prepared(), clearedDungeons: ['banditStockade'] };
      const dungeon = dungeonById[dungeonId];
      const briefing = composeBriefing(dungeon, DAY);
      const estimate = estimateOdds(save, ALL, dungeon, N, { now: 0, loadout, briefing }).success;
      let wins = 0;
      for (let i = 0; i < N; i++) {
        const started = startExpedition({ ...save, nextUid: 10_000 + i }, dungeonId, ALL, 0, 1, undefined, loadout);
        expect(started.expeditions[0].hunger).toBe('underfed');
        if (resolveExpedition(started, started.expeditions[0]).report.success) wins++;
      }
      expect(Math.abs(estimate - wins / N)).toBeLessThan(0.05);
    });
  }

  it('uses current HP, and shows the odds at full HP for comparison', () => {
    const save = { ...prepared(), clearedDungeons: ['banditStockade'] };
    const dungeon = dungeonById.ogreQuarry;
    const briefing = composeBriefing(dungeon, DAY);
    const now = estimateOdds(save, ALL, dungeon, 300, { now: 0, briefing }).success;
    const full = estimateOdds(save, ALL, dungeon, 300, { now: 0, fullHp: true, briefing }).success;
    const later = estimateOdds(save, ALL, dungeon, 300, { now: 3_600_000, briefing }).success;
    expect(full).toBeGreaterThan(now);
    expect(later).toBeGreaterThan(now);
  });

  it('includes the supply status', () => {
    const save = team(3, 3);
    const dungeon = dungeonById.ogreQuarry;
    const briefing = composeBriefing(dungeon, DAY);
    const fed = estimateOdds(save, ALL, dungeon, 300, { briefing }).success;
    const starving = estimateOdds({ ...save, consumables: { healingPotion: 3 } }, ALL, dungeon, 300, { briefing }).success;
    expect(starving).toBeLessThan(fed - 0.05);
  });

  it('without a briefing, plays no threats at all', () => {
    const save = team(2, 3);
    const dungeon = dungeonById.ogreQuarry;
    const estimate = estimateOdds(save, ALL, dungeon, 300).success;
    const briefed = estimateOdds(save, ALL, dungeon, 300, { briefing: composeBriefing(dungeon, DAY) }).success;
    // A briefing can only hurt: whatever the day drew, the no-threat run is the safest.
    expect(estimate).toBeGreaterThanOrEqual(briefed - 0.02);
  });
});

describe('estimateOdds and the meal', () => {
  /** The meal every preview run played with. */
  function mealsSeen(save: SaveData, heroIds: string[], loadout: Loadout, briefing: Briefing) {
    const spy = jest.spyOn(simulate, 'simulateRun');
    try {
      estimateOdds(save, heroIds, dungeonById.ratCellar, 3, { loadout, briefing });
      return spy.mock.results.map((r) => (r.value as ReturnType<typeof simulate.simulateRun>).meal);
    } finally {
      spy.mockRestore();
    }
  }
  const withCook = (): SaveData => {
    const base = team(1, 3);
    const cook = { ...newHero('c', 'Cook', 'cook', 'none', 3) };
    return { ...base, heroes: [...base.heroes, cook], consumables: { ...base.consumables, huntersStew: 1 } };
  };
  const plain: Briefing = { threats: [], restriction: null, opportunity: null };

  it('previews the meal before launch, doubled by a Cook', () => {
    expect(mealsSeen(withCook(), ['bram', 'lyra'], { mealId: 'huntersStew' }, plain)).toEqual(Array(3).fill({ kind: 'bossHeal', pct: 0.15 }));
    expect(mealsSeen(withCook(), ['bram', 'c'], { mealId: 'huntersStew' }, plain)).toEqual(Array(3).fill({ kind: 'bossHeal', pct: 0.3 }));
  });

  it('keeps the meal under Spoiled stores only with a Cook in the party', () => {
    const spoiled = { ...plain, restriction: 'spoiledStores' as const };
    expect(mealsSeen(withCook(), ['bram', 'lyra'], { mealId: 'huntersStew' }, spoiled)).toEqual(Array(3).fill(null));
    expect(mealsSeen(withCook(), ['bram', 'c'], { mealId: 'huntersStew' }, spoiled)).toEqual(Array(3).fill({ kind: 'bossHeal', pct: 0.3 }));
  });
});
