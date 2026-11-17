import { networkUnlocked } from '@/game/supply/unlock';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

/** Whether the supply lines experiment runs: the switch is on and the network is unlocked on this save. */
export function useSupplyOn(): boolean {
  const setting = useSettingsStore((s) => s.supplyLines);
  const unlocked = useGameStore((s) => networkUnlocked(s.save));
  return setting && unlocked;
}
