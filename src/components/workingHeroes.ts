import type { SaveData } from '@/game/save';
import { isPosted, isWorking } from '@/game/team/team';
import { useGameStore } from '@/store/gameStore';

/** Whether a hero of `heroIds` is working or posted, and so is recalled by the send. */
export function includesWorking(save: SaveData, heroIds: string[]): boolean {
  return heroIds.some((id) => isWorking(save, id) || isPosted(save, id));
}

/**
 * The save as it will be once the working and posted heroes of `heroIds` are
 * recalled, so the pure send rules — which refuse busy heroes — see the send
 * going through.
 */
export function asRecalled(save: SaveData, heroIds: string[]): SaveData {
  if (!includesWorking(save, heroIds)) return save;
  return {
    ...save,
    heroes: save.heroes.map((h) => (heroIds.includes(h.id) && h.job ? { ...h, job: null } : h)),
    supply: { ...save.supply, camps: save.supply.camps.map((c) => (c.heroId && heroIds.includes(c.heroId) ? { ...c, heroId: null, postedAt: null } : c)) },
  };
}

/** Recalls the working and posted heroes of `heroIds`, so a send that includes them goes through. */
export function recallWorkingHeroes(heroIds: string[]) {
  const { save, recallFromJob, recallPosted } = useGameStore.getState();
  for (const heroId of heroIds) {
    if (isWorking(save, heroId)) recallFromJob(heroId);
    if (isPosted(save, heroId)) recallPosted(heroId);
  }
}
