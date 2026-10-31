import { startingHeroes } from '@/content/heroes';
import { dungeons } from '@/content/dungeons';
import { oddsRules } from '@/content/odds';
import { dungeonById } from '@/content/lookup';

import { composeBriefing } from '../threats/compose';
import { rotationDay } from '../dungeons/rotation';
import { createInitialSave, type SaveData } from '../save';
import { setHeroHp } from '../team/health';
import { equip } from '../team/team';
import type { Briefing, DungeonDef } from '../types';
import type { Loadout } from './expeditions';
import { estimateOdds, estimatePartyOdds, oddsRunInputs, type Odds } from './odds';
import {
  EMPTY_ODDS,
  finishOddsTask,
  oddsOfTask,
  oddsTaskDone,
  runOddsSlice,
  startOddsTask,
  startPartyOddsTask,
} from './oddsSlices';

const ALL = startingHeroes.map((h) => h.id);
const DAY = rotationDay(0);
const WEAPONS = ['sword', 'bow', 'wand'];

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

describe('the sliced odds estimator', () => {
  /** Runs `task` to the end in slices of `slice`, and returns its odds. */
  const sliced = (task: ReturnType<typeof startOddsTask>, slice: number): Odds => {
    if (!task) throw new Error('empty task');
    while (!oddsTaskDone(task)) runOddsSlice(task, slice);
    return oddsOfTask(task);
  };

  const cases: [string, number, number, number][] = [
    ['ratCellar', 1, 1, 1],
    ['ogreQuarry', 2, 3, 2],
    ['wolfDen', 2, 3, 3],
    ['drownedCrypt', 3, 5, 3],
  ];
  for (const [dungeonId, tier, level, partySize] of cases) {
    it(`slices ${dungeonId} (party of ${partySize}) to exactly the one-shot estimate, whatever the slice size`, () => {
      const save = team(tier, level);
      const party = ALL.slice(0, partySize);
      const dungeon = dungeonById[dungeonId];
      const briefing: Briefing = composeBriefing(dungeon, DAY);
      const expected = estimateOdds(save, party, dungeon, 120, { now: 300_000, briefing });
      for (const slice of [1, 7, 20, 119, 120, 500]) {
        expect(sliced(startOddsTask(save, party, dungeon, 120, { now: 300_000, briefing }), slice)).toEqual(expected);
      }
    });
  }

  it('slices hurt heroes with a meal and a briefing to exactly the one-shot estimate', () => {
    let save = team(3, 9);
    save = setHeroHp(save, 'bram', 0.5, 0);
    save = setHeroHp(save, 'mira', 0.7, 0);
    save = { ...save, consumables: { ...save.consumables, huntersStew: 2 } };
    const dungeon = dungeonById.ogreQuarry;
    const briefing = composeBriefing(dungeon, DAY);
    const loadout: Loadout = { mealId: 'huntersStew' };
    const expected = estimateOdds(save, ALL, dungeon, 150, { now: 0, loadout, briefing });
    expect(sliced(startOddsTask(save, ALL, dungeon, 150, { now: 0, loadout, briefing }), oddsRules.runsPerSlice)).toEqual(expected);
    const expectedFull = estimateOdds(save, ALL, dungeon, 150, { now: 0, loadout, briefing, fullHp: true });
    expect(sliced(startOddsTask(save, ALL, dungeon, 150, { now: 0, loadout, briefing, fullHp: true }), 33)).toEqual(expectedFull);
  });

  it('estimates a prepared party too, exactly as estimatePartyOdds does', () => {
    const save = team(3, 5);
    const dungeon = dungeonById.drownedCrypt;
    const { party, provisions } = oddsRunInputs(save, ALL, dungeon, {});
    const expected = estimatePartyOdds(party, dungeon, 90, provisions);
    const task = startPartyOddsTask(party, dungeon, 90, provisions);
    expect(sliced(task, 4)).toEqual(expected);
  });

  it('knows the odds of an empty party without a single run', () => {
    const dungeon = dungeonById.ratCellar;
    expect(startPartyOddsTask([], dungeon)).toBeNull();
    expect(startOddsTask(team(1, 1), [], dungeon)).toBeNull();
    expect(EMPTY_ODDS).toEqual(estimatePartyOdds([], dungeon, 30));
  });

  it('finishOddsTask runs the whole estimate at once', () => {
    const save = team(2, 3);
    const dungeon = dungeonById.wolfDen;
    const task = startOddsTask(save, ALL.slice(0, 3), dungeon, 60);
    expect(task && finishOddsTask(task)).toEqual(estimateOdds(save, ALL.slice(0, 3), dungeon, 60));
  });

  it(`keeps one slice (${oddsRules.runsPerSlice} runs) under the frame budget`, () => {
    // A phone runs the JS thread roughly 4x slower than this test machine, and a
    // slice is sized to stay under ~8 ms there, so the budget here is 8 ms x 4 =
    // 32 ms — with the generous headroom of a timing assertion built in.
    const BUDGET_MS = 32;
    const save = team(3, 5);
    const shown: DungeonDef[] = [
      dungeons.find((d) => d.tier === 3 && d.slot === 'short')!,
      dungeons.find((d) => d.tier === 3 && d.isBoss)!,
      dungeons.find((d) => d.tier === 3 && d.overnight)!,
    ];
    const briefings = new Map(shown.map((d) => [d.id, composeBriefing(d, DAY)]));
    for (const dungeon of shown) {
      const task = startOddsTask(save, ALL.slice(0, 3), dungeon, 300, { now: 300_000, briefing: briefings.get(dungeon.id)! });
      expect(task).not.toBeNull();
      const start = Date.now();
      runOddsSlice(task!);
      const ms = Date.now() - start;
      // Logged so a regression shows by how much, not just that it broke.
      console.log(`[oddsSlices] one slice of ${oddsRules.runsPerSlice} runs in ${dungeon.id}: ${ms}ms`);
      expect(ms).toBeLessThan(BUDGET_MS);
      expect(task!.done).toBe(oddsRules.runsPerSlice);
    }
  });
});

