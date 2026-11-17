import { networkUnlocked } from '@/game/supply/unlock';
import { useGameStore } from '@/store/gameStore';

/** Whether the supply network is open on this save: tier 2 reached, or the debug unlock. */
export function useSupplyOn(): boolean {
  return useGameStore((s) => networkUnlocked(s.save));
}
