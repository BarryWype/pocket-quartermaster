import { lootConfig } from '@/content/loot/config';

import type { SaveData } from '../save';

/** Whole mysterious keys held, from the fragments gathered. */
export function keysHeld(save: SaveData): number {
  return Math.floor(save.keyFragments / lootConfig.keyFragmentsPerKey);
}

/** Whether a mysterious key can be spent. */
export function hasKey(save: SaveData): boolean {
  return keysHeld(save) > 0;
}

/** Fragments gathered towards the next key. */
export function fragmentsTowardKey(save: SaveData): number {
  return save.keyFragments % lootConfig.keyFragmentsPerKey;
}

/** The next key's progress as dots, filled ones first: '●●○○' for 2 of 4. */
export function keyDots(save: SaveData): string {
  const progress = fragmentsTowardKey(save);
  const total = lootConfig.keyFragmentsPerKey;
  return `${'●'.repeat(progress)}${'○'.repeat(Math.max(0, total - progress))}`;
}

/** Spends a whole key's fragments; throws when none is held. */
export function spendKey(save: SaveData): SaveData {
  if (!hasKey(save)) throw new Error('No mysterious key');
  return { ...save, keyFragments: save.keyFragments - lootConfig.keyFragmentsPerKey };
}

/** Whether the secret places' lock opens for this player. */
export function secretLock(save: SaveData): 'open' | 'closed' {
  return hasKey(save) ? 'open' : 'closed';
}
