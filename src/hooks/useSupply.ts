import { useSettingsStore } from '@/store/settingsStore';

/** Whether the supply lines experiment is on: everything supply renders and works only while it is. */
export function useSupplyOn(): boolean {
  return useSettingsStore((s) => s.supplyLines);
}
