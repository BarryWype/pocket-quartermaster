import type { SaveData } from '../save';
import { isRevealed } from '../reveal/reveal';

/** Whether the supply network is open on this save: the tier 2 reveal, or the debug unlock. */
export function networkUnlocked(save: SaveData): boolean {
  return isRevealed(save, 'network') || save.supply.debugUnlocked;
}

/** Whether the supply lines run: the experiment's switch is on and the network is unlocked. */
export function supplyActive(save: SaveData, switchOn: boolean): boolean {
  return switchOn && networkUnlocked(save);
}
