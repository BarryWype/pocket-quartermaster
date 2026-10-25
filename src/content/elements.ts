import type { Element } from '@/game/elements';

export const elementRules = {
  /** Each element beats the next: fire → grass → stone → electric → water → fire. */
  beats: { fire: 'grass', grass: 'stone', stone: 'electric', electric: 'water', water: 'fire' } as Record<Element, Element>,
  /** Weapon damage against the element it beats, and against the one that beats it. */
  strongMultiplier: 1.5,
  weakMultiplier: 0.75,
  /** Damage taken from attacks of the wearer's armour element. */
  armourMultiplier: 0.5,
  /** Damage taken from an element the hero has no protection against at all. */
  unprotectedMultiplier: 1.5,
  /** Shards of one element that merge into a stone. */
  shardsPerStone: 10,
};

export const elementInfo: Record<Element, { name: string; emoji: string }> = {
  fire: { name: 'Fire', emoji: '🔥' },
  grass: { name: 'Grass', emoji: '🌿' },
  stone: { name: 'Stone', emoji: '🪨' },
  electric: { name: 'Electric', emoji: '⚡' },
  water: { name: 'Water', emoji: '💧' },
};
