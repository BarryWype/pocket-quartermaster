import { periodAt } from '@/game/supply/period';
import { useDebugStore } from '@/store/debugStore';
import { useSettingsStore } from '@/store/settingsStore';

/** Whether the supply lines experiment is on: everything supply renders and works only while it is. */
export function useSupplyOn(): boolean {
  return useSettingsStore((s) => s.supplyLines);
}

/** The richness period a time falls in, with the debug offset applied. */
export function supplyPeriodNow(now: number): number {
  return periodAt(now) + useDebugStore.getState().supplyPeriodOffset;
}

/** `supplyPeriodNow` as a hook: re-renders when the debug offset changes. */
export function useSupplyPeriodNow(now: number): number {
  const offset = useDebugStore((s) => s.supplyPeriodOffset);
  return periodAt(now) + offset;
}
