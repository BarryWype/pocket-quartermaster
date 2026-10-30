import { gearBudgetRules, gearProfiles, type GearProfile } from '@/content/equipment';
import type { RelicDef } from '@/content/loot/relics';
import type { Keyword, RelicEffect, Stats } from '../types';

type Rules = typeof gearBudgetRules;

/** Keywords with a combat number; kit keywords such as `light` answer threats instead. */
const COMBAT_KEYWORDS: Keyword[] = ['pierce', 'cleave', 'blessed', 'guard', 'parry', 'reach', 'stagger', 'brace', 'channel', 'inspire', 'mend'];

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
 * two-handed weapon, less the extras' cost (and any extra cost passed in,
 * a relic's effects), scaled by the tier.
 */
export function gearItemStats(profile: GearProfile, tier: number, rules: Rules = gearBudgetRules, extraCost = 0): Partial<Stats> {
  const budget = rules.budget[profile.slot === 'armor' ? 'armour' : profile.slot] * (1 + (profile.twoHanded ? (rules.twoHandedBonus * rules.budget.offhand) / rules.budget.weapon : 0));
  const left = budget * (1 - extrasCost(profile, rules) - extraCost) * rules.tierScale[tier - 1];
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

/**
 * What one of a relic's effects costs as a share of the item's budget: a
 * combat keyword its usual major or minor share (halved when it only works
 * in a situation), a kit keyword the answers share, anything else its entry
 * in the rules.
 */
export function relicEffectCost(effect: RelicEffect, rules: Rules = gearBudgetRules): number {
  if (effect.kind === 'keyword') {
    const base = COMBAT_KEYWORDS.includes(effect.keyword)
      ? rules.major.includes(effect.keyword)
        ? rules.cost.major
        : rules.cost.minor
      : rules.relic.answers;
    return base * (effect.when ? rules.relic.conditionalShare : 1);
  }
  return rules.relic[effect.kind];
}

/** What all of a relic's effects cost together, as a share of the item's budget. */
export function relicCost(relic: RelicDef, rules: Rules = gearBudgetRules): number {
  return relic.effects.reduce((sum, effect) => sum + relicEffectCost(effect, rules), 0);
}

/** A restored relic piece's base stats: its type's stats less the cost of its effects. */
export function relicStats(relic: RelicDef, rules: Rules = gearBudgetRules): Partial<Stats> {
  return gearItemStats(gearProfiles[relic.gearType], relic.tier, rules, relicCost(relic, rules));
}
