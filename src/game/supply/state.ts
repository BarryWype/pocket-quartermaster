import type { SupplyState } from './types';

/** The supply state before anything is built: no hall, buildings or raid, a parked cart with no crew. */
export function emptySupply(now: number): SupplyState {
  return {
    seen: [],
    hall: null,
    buildings: [],
    personalSite: null,
    cart: {
      route: [],
      nextRoute: null,
      path: null,
      nextPath: null,
      crew: { driver: null, escorts: [] },
      loop: null,
      cargo: {},
      settledAt: now,
      waitingForCrew: false,
      log: [],
    },
    raid: null,
    raidDay: null,
    lastOpenAt: now,
    raidLog: [],
    discovered: {},
    orders: {},
    debugUnlocked: false,
    firstChain: { step: 0, doneAt: null },
    nextId: 1,
  };
}
