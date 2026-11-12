import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { rosterRules } from '@/content/roster';

import { estimateOdds } from '../expeditions/odds';
import { EMPTY_BRIEFING } from '../expeditions/simulate';
import type { SaveData } from '../save';
import type { DungeonDef, HeroClassId } from '../types';
import { FIT_NOW, prepared, rosterParty } from './difficultyOdds';
import { rosterSave } from './reference';

// Class strength for the report and sim:quick: each class swapped into the
// party the dungeons are fitted to, in place of the member whose loss costs
// least, on each tier's medium dungeons at the tier's end with no briefing.

/** Runs per estimate when the full simulator measures the class probe for its summary. */
export const CLASS_RUNS = 150;

export type ClassSwapTier = { tier: number; odds: number; delta: number; replaced: HeroClassId };
export type ClassSwapRow = { classId: HeroClassId; tiers: ClassSwapTier[]; meanDelta: number };
export type ClassSwap = { fitted: { tier: number; odds: number }[]; rows: ClassSwapRow[] };

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
const mediumDungeons = (tier: number) => dungeons.filter((d) => d.tier === tier && d.difficulty === 'medium' && !d.isBoss && !d.overnight);
const oddsOf = (save: SaveData, ids: string[], dungeon: DungeonDef, runs: number) =>
  estimateOdds(prepared(save, ids, dungeon, EMPTY_BRIEFING), ids, dungeon, runs, { now: FIT_NOW, briefing: EMPTY_BRIEFING }).success;

/** Each class's odds and points over the fitted party, per tier, with the class it most often replaced. */
export function classSwapOdds(runs: number, tiers = [1, 2, 3, 4, 5], classes = Object.keys(heroClasses) as HeroClassId[]): ClassSwap {
  const fittedOf = new Map<string, { ids: string[]; odds: number }>();
  const fittedParty = (dungeon: DungeonDef) => {
    let hit = fittedOf.get(dungeon.id);
    if (!hit) {
      const roster = rosterSave(dungeon.tier, 'end');
      const ids = rosterParty(roster, dungeon, EMPTY_BRIEFING, rosterRules.partySize, FIT_NOW).heroIds;
      hit = { ids, odds: oddsOf(roster, ids, dungeon, runs) };
      fittedOf.set(dungeon.id, hit);
    }
    return hit;
  };
  const rows = classes.map((classId): ClassSwapRow => {
    const perTier = tiers.map((tier): ClassSwapTier => {
      const results = mediumDungeons(tier).map((dungeon) => {
        const base = fittedParty(dungeon);
        const save = rosterSave(tier, 'end', [classId]);
        const newcomer = save.heroes[save.heroes.length - 1].id;
        let best = { odds: -1, replaced: classId };
        for (const out of base.ids) {
          const odds = oddsOf(save, base.ids.map((id) => (id === out ? newcomer : id)), dungeon, runs);
          if (odds > best.odds) best = { odds, replaced: save.heroes.find((h) => h.id === out)!.classId };
        }
        return { ...best, delta: best.odds - base.odds };
      });
      const replaced = results.map((r) => r.replaced);
      const most = replaced.reduce((a, b, _, all) => (all.filter((c) => c === b).length > all.filter((c) => c === a).length ? b : a), replaced[0]);
      return { tier, odds: mean(results.map((r) => r.odds)), delta: mean(results.map((r) => r.delta)), replaced: most };
    });
    return { classId, tiers: perTier, meanDelta: mean(perTier.map((t) => t.delta)) };
  });
  const fitted = tiers.map((tier) => ({ tier, odds: mean(mediumDungeons(tier).map((d) => fittedParty(d).odds)) }));
  return { fitted, rows };
}
