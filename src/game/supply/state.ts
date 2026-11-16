import type { SupplyState } from './types';

/** The supply state before anything is built: no hall, cells, camps or raid, a parked cart with no crew. */
export function emptySupply(now: number): SupplyState {
  return {
    seen: [],
    hall: null,
    scouted: {},
    camps: [],
    slotsFreeAt: [],
    cart: {
      route: [],
      nextRoute: null,
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
    nextId: 1,
  };
}
