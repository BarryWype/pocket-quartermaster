import { threatById } from '@/content/lookup';
import { threatRules, type ThreatRules } from '@/content/threats';

import type { ThreatId, ThreatPenalty } from '../types';
import type { ThreatScore } from './score';

/**
 * A penalty as the run applies it, every number already scaled by the state,
 * tagged with the threat it came from. Fractional counts stay fractional for
 * the run to roll (exposed 0.5 → a 50% chance of one exposed fight); `'all'`
 * halved means every other fight.
 */
type Penalty =
  | { kind: 'exposed'; fights: number | 'all'; everyOther?: boolean }
  | { kind: 'weakened'; pct: number }
  | { kind: 'trapWounds'; pct: number }
  | { kind: 'fightWounds'; pct: number }
  | { kind: 'elementalDamage'; multiplier: number }
  | { kind: 'enemyDamage'; tag: 'beast'; pct: number }
  | { kind: 'enemyHp'; tag: 'undead'; pct: number }
  | { kind: 'weakenedAgainst'; pct: number };
export type AppliedPenalty = Penalty & { threatId: ThreatId };

/** One penalty scaled to how badly the threat was missed: half halves every number. */
function scaled(penalty: ThreatPenalty, share: number, threatId: ThreatId): AppliedPenalty {
  switch (penalty.kind) {
    case 'exposed':
      return penalty.fights === 'all'
        ? { kind: 'exposed', fights: 'all', everyOther: share < 1, threatId }
        : { kind: 'exposed', fights: penalty.fights * share, threatId };
    case 'weakened':
      return { kind: 'weakened', pct: penalty.pct * share, threatId };
    case 'trapWounds':
      return { kind: 'trapWounds', pct: penalty.pct * share, threatId };
    case 'fightWounds':
      return { kind: 'fightWounds', pct: penalty.pct * share, threatId };
    case 'elementalDamage':
      // Only the bonus above 1 is halved: ×1.5 becomes ×1.25.
      return { kind: 'elementalDamage', multiplier: 1 + (penalty.multiplier - 1) * share, threatId };
    case 'enemyDamage':
      return { kind: 'enemyDamage', tag: penalty.tag, pct: penalty.pct * share, threatId };
    case 'enemyHp':
      return { kind: 'enemyHp', tag: penalty.tag, pct: penalty.pct * share, threatId };
    case 'weakenedAgainst':
      return { kind: 'weakenedAgainst', pct: penalty.pct * share, threatId };
  }
}

/** The party's multipliers on the penalties of listed threats (see signatures.ts). */
export type PenaltyReduction = { threats?: Partial<Record<ThreatId, number>> };
const NO_REDUCTION: PenaltyReduction = {};

/** The penalties a threat's score inflicts: none when met. */
export function threatPenalties(score: ThreatScore, rules: ThreatRules = threatRules, reduce: PenaltyReduction = NO_REDUCTION): AppliedPenalty[] {
  if (score.state === 'met') return [];
  const share = (score.state === 'half' ? rules.halfShare : 1) * (reduce.threats?.[score.threat.id] ?? 1);
  const def = threatById[score.threat.id];
  return def.penalties[score.threat.level - 1].map((penalty) => scaled(penalty, share, score.threat.id));
}
