import { specials } from '@/content/specials';

import { briefingFor, dailyRotation, rotationDay } from '../dungeons/rotation';
import { tierChain } from '../dungeons/unlock';
import { launchPlan, runProvisions } from '../expeditions/expeditions';
import { estimatePartyOdds } from '../expeditions/odds';
import { prepareParty, type PartyMember } from '../expeditions/simulate';
import type { SpecialId } from '../types';
import { withLoadout } from './bot';
import { simConfig } from './config';
import { quickSave } from './quick';

/**
 * Runs per odds estimate. The seeds are the same for the baseline and every
 * variant (common random numbers), so the gains keep their signal at this
 * sample size; this default keeps the whole check under two minutes.
 */
export const SPECIALS_RUNS = 1000;

/** One special's gain in win odds over the no-special baseline. */
export type SpecialRow = {
  id: SpecialId;
  name: string;
  /** Mean of the gain over every tier × dungeon × hero, in share points. */
  average: number;
  min: number;
  max: number;
  /** A loot-only special never changes win odds, so it is never flagged. */
  lootOnly: boolean;
  /** Out of the median's 0.5×–1.5× balance band (see README). */
  flag: 'low' | 'high' | null;
};

/** The middle value of a sorted-even list: the mean of the two middle ones. */
export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of nothing');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A special's flag against the median of the flag-eligible averages. */
export function flagOf(average: number, medianAverage: number): 'low' | 'high' | null {
  if (average > 1.5 * medianAverage) return 'high';
  if (average < 0.5 * medianAverage) return 'low';
  return null;
}

/**
 * The specials balance check (`npm run sim:specials`): for every tier, the quick
 * reference trio against the tier's whole chain, once with nobody's special and
 * once with only one hero carrying each special in turn. The gain is the win
 * odds minus the baseline's, and every special should sit in the same band.
 */
export function specialsCheck(runs = SPECIALS_RUNS): SpecialRow[] {
  const now = simConfig.startDay + 12 * 3_600_000;
  const rotation = dailyRotation(rotationDay(now));
  const gains = new Map<SpecialId, number[]>(Object.values(specials).map((s) => [s.id, []]));
  const lootOnly = new Map<SpecialId, boolean>(Object.values(specials).map((s) => [s.id, s.effect.kind === 'extraLoot']));
  for (const tier of [1, 2, 3, 4, 5]) {
    const base = quickSave(tier);
    const ids = base.heroes.map((h) => h.id);
    for (const dungeon of tierChain(tier)) {
      const briefing = briefingFor(rotation, dungeon);
      const prepared = withLoadout(base, ids, dungeon, briefing);
      // HeroState always carries a special, so the party is built once and the
      // specials are handed out at the member level (undefined = none).
      const members = prepareParty(prepared, ids, now, true);
      const bare = members.map((m) => ({ ...m, special: undefined }));
      const { hunger } = launchPlan(prepared, dungeon, ids, {}, briefing);
      const provisions = { ...runProvisions(hunger, {}, briefing), blessed: prepared.expeditionBlessing };
      const oddsOf = (party: PartyMember[]) => estimatePartyOdds(party, dungeon, runs, provisions).success;
      // The same seeds serve the baseline and every variant, so the noise mostly cancels.
      const baseline = oddsOf(bare);
      for (const id of gains.keys()) {
        for (const heroId of ids) {
          const variant = bare.map((m) => (m.heroId === heroId ? { ...m, special: id } : m));
          gains.get(id)!.push(oddsOf(variant) - baseline);
        }
      }
    }
  }
  const rows = Object.values(specials).map((def) => {
    const values = gains.get(def.id)!;
    return {
      id: def.id,
      name: def.name,
      average: (values.reduce((sum, v) => sum + v, 0) / values.length) * 100,
      min: Math.min(...values) * 100,
      max: Math.max(...values) * 100,
      lootOnly: lootOnly.get(def.id)!,
      flag: null,
    };
  });
  const medianAverage = median(rows.filter((row) => !row.lootOnly).map((row) => row.average));
  return rows.map((row) => ({ ...row, flag: row.lootOnly ? null : flagOf(row.average, medianAverage) }));
}

const pts = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;

/** The check's markdown table, as the CLI prints it and report.md keeps it. */
export function specialsTable(rows: SpecialRow[]): string {
  const lines = [
    '| special | average gain | min | max | flag |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.name} | ${pts(row.average)} pts | ${pts(row.min)} pts | ${pts(row.max)} pts | ${row.lootOnly ? 'loot only' : row.flag ?? ''} |`,
    ),
  ];
  return lines.join('\n');
}
