import type { SaveData } from '@/game/save';
import { isWorking } from '@/game/team/team';
import { useGameStore } from '@/store/gameStore';

/** Whether a hero of `heroIds` is working, and so is recalled by the send. */
export function includesWorking(save: SaveData, heroIds: string[]): boolean {
  return heroIds.some((id) => isWorking(save, id));
}

/**
 * The save as it will be once the working heroes of `heroIds` are recalled, so
 * the pure send rules — which refuse working heroes — see the send going through.
 */
export function asRecalled(save: SaveData, heroIds: string[]): SaveData {
  return includesWorking(save, heroIds)
    ? { ...save, heroes: save.heroes.map((h) => (h.job && heroIds.includes(h.id) ? { ...h, job: null } : h)) }
    : save;
}

/** Recalls the working heroes of `heroIds`, so a send that includes them goes through. */
export function recallWorkingHeroes(heroIds: string[]) {
  const { save, recallFromJob } = useGameStore.getState();
  for (const heroId of heroIds) if (isWorking(save, heroId)) recallFromJob(heroId);
}
