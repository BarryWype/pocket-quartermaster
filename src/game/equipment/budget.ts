import { gearBudgetRules, type GearProfile } from '@/content/equipment';

import type { Stats } from '../types';

type Rules = typeof gearBudgetRules;

/**
 * The share of an item's budget its flat extras, keywords, Heavy and
 * Concealed cost (a Speed malus refunds some), exactly as `extras_cost` in
 * tools/gear-budget.py.
 */
export function extrasCost(profile: GearProfile, rules: Rules = gearBudgetRules) {
  const { extras, keywords } = profile;
  let cost = rules.cost.speed * (extras.speed ?? 0) + rules.cost.crit * (extras.crit ?? 0) + rules.cost.evasion * (extras.evasion ?? 0) + rules.cost.approach * (extras.approach ?? 0);
  for (const keyword of keywords) cost += rules.major.includes(keyword) ? rules.cost.major : rules.cost.minor;
  if (profile.heavy) cost += rules.cost.heavy;
  if (profile.concealed) cost += rules.cost.concealed;
  return cost;
}

/**
 * A gear type's stats at `tier`, the same maths as `item()` in
 * tools/gear-budget.py: the slot's budget, plus the off-hand's for a
 * two-handed weapon, less the extras' cost, scaled by the tier.
 */
export function gearItemStats(profile: GearProfile, tier: number, rules: Rules = gearBudgetRules): Partial<Stats> {
  const budget = rules.budget[profile.slot === 'armor' ? 'armour' : profile.slot] * (1 + (profile.twoHanded ? (rules.twoHandedBonus * rules.budget.offhand) / rules.budget.weapon : 0));
  const left = budget * (1 - extrasCost(profile, rules)) * rules.tierScale[tier - 1];
  const total = Object.values(profile.shares).reduce((sum, share) => sum + (share ?? 0), 0);
  const stats: Partial<Record<'power' | 'magic' | 'armour' | 'resistance' | 'hp', number>> = {};
  for (const [stat, share] of Object.entries(profile.shares)) {
    stats[stat as keyof typeof stats] = left * ((share ?? 0) / total) * (stat === 'hp' ? rules.hpPerPoint : 1);
  }
  const evasion = profile.extras.evasion ? profile.extras.evasion + (tier - 1) * rules.evasionPerTier : 0;
  return {
    power: stats.power ?? 0,
    magic: stats.magic ?? 0,
    armour: stats.armour ?? 0,
    resistance: stats.resistance ?? 0,
    hp: stats.hp ?? 0,
    ...(profile.extras.speed ? { speed: profile.extras.speed } : {}),
    ...(profile.extras.crit ? { crit: profile.extras.crit } : {}),
    ...(evasion ? { evasion } : {}),
  };
}
