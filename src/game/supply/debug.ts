import type { SaveData } from '../save';
import type { CartEvent } from './types';

/** Shifts a timestamp back by `ms`, keeping nulls and optionals. */
const aged = (ms: number) => (at: number) => at - ms;

/**
 * Debug: shifts every timestamp in the supply state back by `ms` — the
 * buildings' times, the cart's settlement and loop, the raids and the hall's
 * moves — so the network can be replayed to now. Discovered places keep their
 * expiries: places follow the real clock. Pure: the caller settles.
 */
export function ageNetwork(save: SaveData, ms: number): SaveData {
  const shift = aged(ms);
  const supply = save.supply;
  const loop = supply.cart.loop;
  return {
    ...save,
    supply: {
      ...supply,
      hall: supply.hall ? { ...supply.hall, moves: supply.hall.moves.map(shift) } : null,
      buildings: supply.buildings.map((building) => ({
        ...building,
        builtAt: shift(building.builtAt),
        expiresAt: shift(building.expiresAt),
        postedAt: building.postedAt === null ? null : shift(building.postedAt),
        settledAt: shift(building.settledAt),
        inspectedUntil: shift(building.inspectedUntil),
        closedUntil: shift(building.closedUntil),
      })),
      cart: {
        ...supply.cart,
        settledAt: shift(supply.cart.settledAt),
        loop: loop
          ? {
              ...loop,
              startedAt: shift(loop.startedAt),
              endsAt: shift(loop.endsAt),
              events: loop.events.map((event) => ({ ...event, at: shift(event.at) } as CartEvent)),
            }
          : null,
        log: supply.cart.log.map((line) => ({ ...line, endedAt: shift(line.endedAt) })),
      },
      raid: supply.raid
        ? {
            ...supply.raid,
            landsAt: shift(supply.raid.landsAt),
            defenders: supply.raid.defenders.map((defender) => ({
              ...defender,
              sentAt: shift(defender.sentAt),
              arrivesAt: shift(defender.arrivesAt),
              ...(defender.returnsAt !== undefined ? { returnsAt: shift(defender.returnsAt) } : {}),
            })),
          }
        : null,
      raidLog: supply.raidLog.map((line) => ({ ...line, landsAt: shift(line.landsAt) })),
      lastOpenAt: shift(supply.lastOpenAt),
    },
  };
}
