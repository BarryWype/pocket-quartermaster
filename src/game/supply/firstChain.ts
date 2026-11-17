import { supplyRules } from '@/content/supplyLines';

import type { SaveData } from '../save';

/** The first chain's steps, in order; each id keys its texts (i18n `supply.firstChain`). */
export const FIRST_CHAIN_STEPS = ['hall', 'site', 'farm', 'tavern', 'route', 'delivery'] as const;
export type FirstChainStep = (typeof FIRST_CHAIN_STEPS)[number];

/** The discovered ids that count as a site: world, personal and debug sites. */
export const isSiteId = (id: string) => id.startsWith('place:site:') || id.startsWith('site:personal:') || id.startsWith('site:debug:');

/** The discovered ids that count as a tavern: world and personal taverns. */
export const isTavernId = (id: string) => id.startsWith('place:tavern:') || id.startsWith('tavern:personal:');

/** Whether the step's condition holds on the save. */
function stepMet(save: SaveData, step: FirstChainStep): boolean {
  const supply = save.supply;
  switch (step) {
    case 'hall':
      return supply.hall !== null;
    case 'site':
      return Object.keys(supply.discovered).some(isSiteId);
    case 'farm':
      return supply.buildings.some((building) => building.kind === 'farm');
    case 'tavern':
      return Object.keys(supply.discovered).some(isTavernId);
    case 'route': {
      const route = supply.cart.nextRoute ?? supply.cart.route;
      return route.some((point) => 'building' in point) && route.some((point) => 'place' in point);
    }
    case 'delivery':
      return Object.values(supply.orders).some((order) => Object.values(order.delivered).some((amount) => amount > 0));
  }
}

/**
 * Moves the first chain forward while the current step's condition holds,
 * several steps at a time. When the last step is met the reward is paid once,
 * `doneAt` is set and `finished` is true on that call only; a finished chain
 * never changes again. The same save object comes back when nothing changed.
 */
export function advanceFirstChain(save: SaveData, now: number): { save: SaveData; finished: boolean } {
  const chain = save.supply.firstChain;
  if (chain.doneAt !== null) return { save, finished: false };
  let step = chain.step;
  while (step < FIRST_CHAIN_STEPS.length && stepMet(save, FIRST_CHAIN_STEPS[step])) step += 1;
  if (step === chain.step) return { save, finished: false };
  if (step < FIRST_CHAIN_STEPS.length) {
    return { save: { ...save, supply: { ...save.supply, firstChain: { ...chain, step } } }, finished: false };
  }
  return {
    save: {
      ...save,
      gold: save.gold + supplyRules.firstChain.rewardGold,
      supply: { ...save.supply, firstChain: { step, doneAt: now } },
    },
    finished: true,
  };
}
