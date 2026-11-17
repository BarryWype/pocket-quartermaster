import type { SaveData } from '../save';
import { isRevealed } from '../reveal/reveal';

/** Whether the supply network is open on this save: the tier 2 reveal, or the debug unlock. */
export function networkUnlocked(save: SaveData): boolean {
  return isRevealed(save, 'network') || save.supply.debugUnlocked;
}

