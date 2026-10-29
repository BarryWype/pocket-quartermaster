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
  | { kind: 'fightWounds'; pct: number; targets: 'all' | 'one' }
  | { kind: 'delay'; pct: number }
  | { kind: 'hunger'; supply: number }
  | { kind: 'lostLoot'; pct: number }
  /** The chance the locals turn hostile. */
  | { kind: 'extraFight'; chance: number }
  | { kind: 'elementalDamage'; multiplier: number }
  | { kind: 'enemyDamage'; tag: 'beast'; pct: number }
  | { kind: 'enemyHp'; tag: 'undead'; pct: number }
  | { kind: 'weakenedAgainst'; pct: number }
  | { kind: 'extraEnemies'; count: number }
  | { kind: 'bruteDamage'; pct: number }
  /** Healing during the run is multiplied by this. */
  | { kind: 'healingHalved'; multiplier: number };

/**
 * A penalty as the run applies it: every number already scaled by the state,
 * tagged with the threat it came from. Fractional counts stay fractional for
 * the run to roll (exposed 0.5 → a 50% chance of one exposed fight); `'all'`
 * halved means every other fight.
 */
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
      return { kind: 'fightWounds', pct: penalty.pct * share, targets: penalty.targets, threatId };
    case 'delay':
      return { kind: 'delay', pct: penalty.pct * share, threatId };
    case 'hunger':
      // Half a supply point is not owed: hunger rounds down.
      return { kind: 'hunger', supply: Math.floor(penalty.supply * share), threatId };
    case 'lostLoot':
      return { kind: 'lostLoot', pct: penalty.pct * share, threatId };
    case 'extraFight':
      return { kind: 'extraFight', chance: share, threatId };
    case 'elementalDamage':
      // Only the bonus above 1 is halved: ×1.5 becomes ×1.25.
      return { kind: 'elementalDamage', multiplier: 1 + (penalty.multiplier - 1) * share, threatId };
    case 'enemyDamage':
      return { kind: 'enemyDamage', tag: penalty.tag, pct: penalty.pct * share, threatId };
    case 'enemyHp':
      return { kind: 'enemyHp', tag: penalty.tag, pct: penalty.pct * share, threatId };
    case 'weakenedAgainst':
      return { kind: 'weakenedAgainst', pct: penalty.pct * share, threatId };
    case 'extraEnemies':
      return { kind: 'extraEnemies', count: penalty.count * share, threatId };
    case 'bruteDamage':
      return { kind: 'bruteDamage', pct: penalty.pct * share, threatId };
    case 'healingHalved':
      return { kind: 'healingHalved', multiplier: share < 1 ? 0.75 : 0.5, threatId };
  }
}

/**
 * The penalties a threat's score inflicts: none when met, except a Locked
 * forced with Might, which still loses `forcedLockLoss` of the loot.
 */
export function threatPenalties(score: ThreatScore, rules: ThreatRules = threatRules): AppliedPenalty[] {
  if (score.state === 'met') {
    return score.forced ? [{ kind: 'lostLoot', pct: rules.forcedLockLoss, threatId: score.threat.id }] : [];
  }
  const share = score.state === 'half' ? rules.halfShare : 1;
  const def = threatById[score.threat.id];
  return def.penalties[score.threat.level - 1].map((penalty) => scaled(penalty, share, score.threat.id));
}

export type LaunchEffects = {
  /** Expedition time multiplied by this: every delay compounds. */
  timeMultiplier: number;
  /** Extra supply points the hunger penalties add to the launch need. */
  extraSupply: number;
};

/** What a briefing's scores cost at launch: the delays stretch the time, the hunger adds supply. */
export function launchEffects(scores: ThreatScore[], rules: ThreatRules = threatRules): LaunchEffects {
  const penalties = scores.flatMap((score) => threatPenalties(score, rules));
  return {
    timeMultiplier: penalties.reduce((m, p) => m * (p.kind === 'delay' ? 1 + p.pct : 1), 1),
    extraSupply: penalties.reduce((sum, p) => sum + (p.kind === 'hunger' ? p.supply : 0), 0),
  };
}
