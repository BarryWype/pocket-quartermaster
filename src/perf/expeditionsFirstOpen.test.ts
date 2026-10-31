/**
 * Issue 17: what the first opening of Expeditions pays that later openings don't.
 *
 * Each piece of work the screen does on its first opening is timed cold (first
 * call in a fresh module registry, `jest.isolateModules`) and warm (second call
 * in that same registry), on a debug save at tier 3 with three heroes. The
 * table is logged, not asserted: it is a measurement, and the numbers move
 * with the machine.
 *
 * Phone estimate: ×4, an assumption for a mid-range phone against this
 * development machine (Hermes is generally several times slower than V8 here,
 * and the original report is a release build on a phone).
 */
import { dungeons } from '@/content/dungeons';
import { startingHeroes } from '@/content/heroes';

import { rotationDay } from '@/game/dungeons/rotation';
import { composeBriefing } from '@/game/threats/compose';
import { createInitialSave, type SaveData } from '@/game/save';
import { equip } from '@/game/team/team';
import type { DungeonDef } from '@/game/types';

/** What a phone pays relative to this machine, for the estimate column. */
const PHONE_FACTOR = 4;

const ALL = startingHeroes.map((h) => h.id);
const PARTY = ALL.slice(0, 3);

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

/** Wall-clock milliseconds for one synchronous run. */
const timed = (run: () => unknown): number => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

/**
 * Times `run` against a fresh module registry: its first (cold) and second
 * (warm) call. `setup` runs first in the same registry, outside both timings,
 * for inputs the run needs but must not pay for here (e.g. the rotation
 * replay, which has its own row).
 */
/** Loads a module from the fresh registry behind `jest.isolateModules`. */
type Loader = <M>(path: string) => M;

function coldAndWarm(setup: (load: Loader) => unknown, run: (load: Loader, timesRun: number) => unknown): [number, number] {
  let cold = 0;
  let warm = 0;
  jest.isolateModules(() => {
    const load: Loader = <M,>(path: string): M => jest.requireActual(path) as M;
    setup(load);
    cold = timed(() => run(load, 1));
    warm = timed(() => run(load, 2));
  });
  return [cold, warm];
}

type Row = { name: string; cold: number; warm: number };

describe('the first opening of Expeditions', () => {
  it('times each piece of work only the first opening pays', () => {
    const save = debugSave();
    const now = Date.now();
    const today = rotationDay(now);

    // What the screen would show today at tier 3: the rotation's short, long
    // and boss, plus the tier's overnight run.
    const rotationModule = jest.requireActual<typeof import('@/game/dungeons/rotation')>('@/game/dungeons/rotation');
    const rotation = rotationModule.dailyRotation(today);
    const shown: DungeonDef[] = [
      dungeons.find((d) => d.id === rotation.tiers[3].short)!,
      dungeons.find((d) => d.id === rotation.tiers[3].long)!,
      dungeons.find((d) => d.id === rotation.tiers[3].boss)!,
      dungeons.find((d) => d.tier === 3 && d.overnight)!,
    ];
    const rows: Row[] = [];
    const row = (name: string, cold: number, warm: number) => rows.push({ name, cold, warm });

    // The rotation replay: dailyRotation replays every day since startDay.
    {
      const [cold, warm] = coldAndWarm(
        () => {},
        (load) => {
          const m = load<typeof import('@/game/dungeons/rotation')>('@/game/dungeons/rotation');
          m.dailyRotation(today);
        },
      );
      row('dailyRotation(today) — the replay', cold, warm);
    }

    // currentRotation: what the screen's useMemo actually calls.
    {
      const [cold, warm] = coldAndWarm(
        () => {},
        (load) => {
          const m = load<typeof import('@/store/debugStore')>('@/store/debugStore');
          m.currentRotation(now);
        },
      );
      row('currentRotation(now)', cold, warm);
    }

    // The screen's module evaluation (and the rotation's own module graph).
    {
      const [cold] = coldAndWarm(
        () => {},
        (load) => {
          load('@/game/dungeons/rotation');
        },
      );
      row('module eval: game/dungeons/rotation', cold, 0);
    }
    {
      const [cold] = coldAndWarm(
        () => {},
        (load) => {
          load('@/app/expeditions');
        },
      );
      row('module eval: app/expeditions (+ imports)', cold, 0);
    }

    // composeBriefing for the dungeons shown.
    {
      const [cold, warm] = coldAndWarm(
        () => {},
        (load) => {
          const m = load<typeof import('@/game/threats/compose')>('@/game/threats/compose');
          for (const d of shown) m.composeBriefing(d, today);
        },
      );
      row('composeBriefing x4 shown', cold, warm);
    }

    // briefingOf for the dungeons shown (the rotation replay paid for above, not here).
    {
      const [cold, warm] = coldAndWarm(
        (load) => {
          load<typeof import('@/game/dungeons/rotation')>('@/game/dungeons/rotation').dailyRotation(today);
        },
        (load) => {
          const dungeonsMod = load<typeof import('@/game/dungeons/rotation')>('@/game/dungeons/rotation');
          const expeditionsMod = load<typeof import('@/game/expeditions/expeditions')>('@/game/expeditions/expeditions');
          const todayRotation = dungeonsMod.dailyRotation(today);
          for (const d of shown) expeditionsMod.briefingOf(save, d, todayRotation, now);
        },
      );
      row('briefingOf x4 shown', cold, warm);
    }

    // estimateOdds per dungeon of the default tier plus the overnight one.
    for (const dungeon of shown) {
      const briefing = composeBriefing(dungeon, today);
      const [cold, warm] = coldAndWarm(
        () => {},
        (load) => {
          const m = load<typeof import('@/game/expeditions/odds')>('@/game/expeditions/odds');
          m.estimateOdds(save, PARTY, dungeon, undefined, { now, briefing });
        },
      );
      row(`estimateOdds ${dungeon.id}`, cold, warm);
    }

    // The same estimates through the issue 12 cache: first pass (cold cache) then all hits.
    {
      const briefings = new Map(shown.map((d) => [d, composeBriefing(d, today)]));
      const [cold, warm] = coldAndWarm(
        () => {},
        (load) => {
          const m = load<typeof import('@/game/expeditions/oddsCache')>('@/game/expeditions/oddsCache');
          for (const d of shown) m.cachedEstimateOdds(save, PARTY, d, undefined, { now, briefing: briefings.get(d)! });
        },
      );
      row('cachedEstimateOdds x4 (cold cache / all hits)', cold, warm);
    }

    // The first render's pure inputs (the rotation replay paid for above, not here).
    {
      const [cold, warm] = coldAndWarm(
        (load) => {
          load<typeof import('@/game/dungeons/rotation')>('@/game/dungeons/rotation').dailyRotation(today);
        },
        (load) => {
          const unlockMod = load<typeof import('@/game/dungeons/unlock')>('@/game/dungeons/unlock');
          const lookup = load<typeof import('@/content/lookup')>('@/content/lookup');
          const rotationMod = load<typeof import('@/game/dungeons/rotation')>('@/game/dungeons/rotation');
          const todayRotation = rotationMod.dailyRotation(today);
          const ids = Object.values(todayRotation.tiers).flatMap((t) => [t.short, t.long, t.boss]);
          ids.map((id) => lookup.dungeonById[id]).filter((d) => unlockMod.isDungeonUnlocked(save, d)).sort((a, b) => a.tier - b.tier);
          dungeons.filter((d) => d.overnight && unlockMod.isDungeonUnlocked(save, d));
        },
      );
      row('open + overnight lists', cold, warm);
    }
    {
      const [cold, warm] = coldAndWarm(
        (load) => {
          load<typeof import('@/game/dungeons/rotation')>('@/game/dungeons/rotation').dailyRotation(today);
        },
        (load) => {
          const rotationMod = load<typeof import('@/game/dungeons/rotation')>('@/game/dungeons/rotation');
          const expeditionsMod = load<typeof import('@/game/expeditions/expeditions')>('@/game/expeditions/expeditions');
          const cacheMod = load<typeof import('@/game/expeditions/oddsCache')>('@/game/expeditions/oddsCache');
          const todayRotation = rotationMod.dailyRotation(today);
          for (const d of shown) {
            cacheMod.oddsKey({
              save,
              heroIds: PARTY,
              dungeon: d,
              options: { now, briefing: expeditionsMod.briefingOf(save, d, todayRotation, now) },
            });
          }
        },
      );
      row('oddsKeys x4 (oddsKey + briefingOf)', cold, warm);
    }
    {
      const [cold, warm] = coldAndWarm(
        () => {},
        (load) => {
          const m = load<typeof import('@/game/expeditions/expeditions')>('@/game/expeditions/expeditions');
          m.readyExpeditions(save, now);
        },
      );
      row('readyExpeditions', cold, warm);
    }
    {
      const briefing = composeBriefing(shown[0], today);
      const [cold, warm] = coldAndWarm(
        () => {},
        (load) => {
          const m = load<typeof import('@/game/threats/coverage')>('@/game/threats/coverage');
          m.briefingCoverage(save, PARTY, briefing, now);
        },
      );
      row('briefingCoverage (focused dungeon)', cold, warm);
    }

    const table = rows.map((r) => ({
      name: r.name,
      'cold ms': r.cold.toFixed(1),
      'warm ms': r.warm.toFixed(1),
      'phone est ms (cold x4)': (r.cold * PHONE_FACTOR).toFixed(0),
    }));
    console.table(table);
  });
});
