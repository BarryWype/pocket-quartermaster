import { elementRules } from '@/content/elements';

export const ELEMENTS = ['fire', 'grass', 'stone', 'electric', 'water'] as const;
export type Element = (typeof ELEMENTS)[number];

type ElementRules = typeof elementRules;

export const shardId = (element: Element) => `${element}Shard`;
export const stoneId = (element: Element) => `${element}Stone`;

export function beats(attacker: Element, target: Element, rules: ElementRules = elementRules) {
  return rules.beats[attacker] === target;
}

/** Weapon damage against a target: stronger against the element it beats, weaker against the one beating it. */
export function weaponMultiplier(weapon: Element | undefined, target: Element | undefined, rules: ElementRules = elementRules) {
  if (!weapon || !target) return 1;
  if (beats(weapon, target, rules)) return rules.strongMultiplier;
  if (beats(target, weapon, rules)) return rules.weakMultiplier;
  return 1;
}

/**
 * Damage taken from an attack: halved by armour of the same element, normal
 * with a class resist or protective consumable, increased with no protection.
 */
export function incomingMultiplier(
  attack: Element | undefined,
  defender: { armour?: Element; resists: Element[] },
  rules: ElementRules = elementRules,
) {
  if (!attack) return 1;
  if (defender.armour === attack) return rules.armourMultiplier;
  return defender.resists.includes(attack) ? 1 : rules.unprotectedMultiplier;
}

/** Merges every `shardsPerStone` shards of an element into one stone of it. */
export function convertShards(materials: Record<string, number>, rules: ElementRules = elementRules) {
  const next = { ...materials };
  for (const element of ELEMENTS) {
    const shards = next[shardId(element)] ?? 0;
    const stones = Math.floor(shards / rules.shardsPerStone);
    if (stones === 0) continue;
    next[stoneId(element)] = (next[stoneId(element)] ?? 0) + stones;
    const left = shards - stones * rules.shardsPerStone;
    if (left > 0) next[shardId(element)] = left;
    else delete next[shardId(element)];
  }
  return next;
}
