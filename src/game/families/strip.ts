import { familyOfThreat, familyRules, families, type FamilyId } from '@/content/families';

import type { ActiveThreat } from '../types';
import { familyLevel, type FamilyCounts } from './families';

// The party family strip's pure model: one chip per family the party has,
// the families a briefing's threats need first.

/** A family a threat needs, at the threat's level; `met` when the threat scoring already decided it. */
export type FamilyNeed = { family: FamilyId; level: number; met?: boolean };

export type StripChip = {
  family: FamilyId;
  /** The party's tags of the family, and the level they reach (0 to 3). */
  count: number;
  level: number;
  /** What a threat asks of the family: its tag count, and whether the party meets it. */
  need: { count: number; met: boolean } | null;
  /** The next level, its tag count and how many tags short the party is; null at level 3. */
  next: { level: number; count: number; short: number } | null;
};

/** The tag count a family level is reached at: 2, 4 or 6. */
export const tagsForLevel = (level: number): number => familyRules.levels[level - 1];

/** The families a briefing's threats need, at each threat's level. */
export function threatNeeds(threats: Pick<ActiveThreat, 'id' | 'level'>[]): FamilyNeed[] {
  return threats.map((threat) => ({ family: familyOfThreat(threat.id), level: threat.level }));
}

function chipOf(family: FamilyId, count: number, need: FamilyNeed | undefined): StripChip {
  const level = familyLevel(count);
  const nextAt = familyRules.levels[level];
  return {
    family,
    count,
    level,
    need: need ? { count: tagsForLevel(need.level), met: need.met ?? level >= need.level } : null,
    next: nextAt === undefined ? null : { level: level + 1, count: nextAt, short: nextAt - count },
  };
}

/** The strip's chips: the needed families first, in the order asked, then the rest of the party's, most tags first. */
export function familyStrip(counts: FamilyCounts, needs: FamilyNeed[] = []): StripChip[] {
  // A family needed twice keeps its highest level.
  const needed = new Map<FamilyId, FamilyNeed>();
  for (const need of needs) {
    const held = needed.get(need.family);
    if (!held || need.level > held.level) needed.set(need.family, need);
  }
  const order = new Map(families.map((family, i) => [family.id, i]));
  const rest = (Object.entries(counts) as [FamilyId, number][])
    .filter(([family, count]) => count > 0 && !needed.has(family))
    .sort(([a, countA], [b, countB]) => countB - countA || order.get(a)! - order.get(b)!);
  return [
    ...[...needed.values()].map((need) => chipOf(need.family, counts[need.family] ?? 0, need)),
    ...rest.map(([family, count]) => chipOf(family, count, undefined)),
  ];
}
