import { startingHeroes } from '@/content/heroes';
import { dungeons } from '@/content/dungeons';

import { composeBriefing } from '../threats/compose';
import { rotationDay } from '../dungeons/rotation';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { Briefing, DungeonDef } from '../types';
import * as odds from './odds';
import { estimateOdds } from './odds';
import { cachedEstimateOdds, cachedOdds, oddsKey } from './oddsCache';

const ALL = startingHeroes.map((h) => h.id);
const PARTY = ALL.slice(0, 3);
const DAY = rotationDay(0);

/** A debug-style save at tier 3: heroes in the tier's weapons and armour, each with a healing potion. */
function debugSave(): SaveData {
  const base = createInitialSave();
  let save: SaveData = {
    ...base,
    tutorial: { ...base.tutorial, step: 'done' },
    clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'],
    heroes: base.heroes.map((h) => ({ ...h, level: 5 })),
    consumables: { ...base.consumables, healingPotion: 3 },
    gear: ALL.flatMap((_, i) => [
      { uid: `w${i}`, itemId: `sword3`, quality: 'normal' as const },
      { uid: `a${i}`, itemId: `mail3`, quality: 'normal' as const },
    ]),
  };
  ALL.forEach((id, i) => {
    save = equip(equip(equip(save, id, 'weapon', `w${i}`), id, 'armor', `a${i}`), id, 'consumable', 'healingPotion');
  });
  return save;
}

describe('odds performance', () => {
  // The dungeons the Expeditions screen shows at tier 3: the rotation's short, long and
  // boss, plus the overnight one.
  const save = debugSave();
  const now = 300_000;
  // The rotation picks one short and one long per tier; the screen shows those two, the boss and the overnight one.
  const shown: DungeonDef[] = [
    dungeons.find((d) => d.tier === 3 && d.slot === 'short')!,
    dungeons.find((d) => d.tier === 3 && d.slot === 'long')!,
    dungeons.find((d) => d.tier === 3 && d.isBoss)!,
    dungeons.find((d) => d.tier === 3 && d.overnight)!,
  ];
  const briefings = new Map<string, Briefing>(shown.map((d) => [d.id, composeBriefing(d, DAY)]));

  it('measures the synchronous block the screen used to run on mount', () => {
    const start = Date.now();
    for (const dungeon of shown) {
      estimateOdds(save, PARTY, dungeon, undefined, { now, briefing: briefings.get(dungeon.id)! });
    }
    const ms = Date.now() - start;
    // Logged, not asserted. The 'before' number — this synchronous block, run by the
    // screen's first render on open — measured ~110 ms for 4 dungeons x 300 runs on a
    // development machine here (seconds on a phone, twice the block in the Send dialog),
    // on every save or party write.
    console.log(`[oddsPerf] synchronous block of ${shown.length} dungeons: ${ms}ms`);
    expect(ms).toBeGreaterThan(0);
  });

  it('runs no estimateOdds on the first-render path, and a cached re-run is near-zero', () => {
    const spy = jest.spyOn(odds, 'estimateOdds');
    // What the screen's first render does: build the keys and read the cache, per shown dungeon.
    const keys = shown.map((dungeon) =>
      oddsKey({ save, heroIds: PARTY, dungeon, options: { now, briefing: briefings.get(dungeon.id)! } }),
    );
    for (const key of keys) cachedOdds(key);
    expect(spy).not.toHaveBeenCalled();
    // The deferred computation fills the cache (this is the off-first-frame work)…
    for (const dungeon of shown) {
      cachedEstimateOdds(save, PARTY, dungeon, undefined, { now, briefing: briefings.get(dungeon.id)! });
    }
    expect(spy).toHaveBeenCalledTimes(shown.length);
    spy.mockRestore();
    // …so a re-render with the same inputs costs key-building and cache reads only.
    const start = Date.now();
    for (const dungeon of shown) {
      const key = oddsKey({ save, heroIds: PARTY, dungeon, options: { now, briefing: briefings.get(dungeon.id)! } });
      const held = cachedOdds(key);
      expect(held).toBeDefined();
      expect(held).toBe(cachedEstimateOdds(save, PARTY, dungeon, undefined, { now, briefing: briefings.get(dungeon.id)! }));
    }
    const cachedMs = Date.now() - start;
    console.log(`[oddsPerf] cached re-render of ${shown.length} dungeons: ${cachedMs}ms`);
    expect(cachedMs).toBeLessThan(50);
  });
});
