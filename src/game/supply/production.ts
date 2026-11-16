import { supplyRules } from '@/content/supplyLines';

import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import { tradeLevel } from './trades';
import type { Building } from './types';

const HOUR = 3_600_000;

export type BuildingRateParts = {
  quality: number;
  /** Quality × the base rate: the full rate before shares and bonuses. */
  base: number;
  /** 1 with a hero posted, the locals' share without one. */
  share: number;
  tradeBonus: number;
  inspected: boolean;
  rate: number;
};

/** The building's output rate at a time, broken into its parts for display. */
export function buildingRateParts(save: SaveData, building: Building, t: number): BuildingRateParts {
  if (t < building.closedUntil) return { quality: building.quality, base: 0, share: 0, tradeBonus: 0, inspected: false, rate: 0 };
  const base = building.quality * supplyRules.buildings.kinds[building.kind].baseRate;
  const hero = building.heroId ? save.heroes.find((h) => h.id === building.heroId) : undefined;
  const share = hero ? 1 : supplyRules.production.localsShare;
  const tradeBonus =
    hero && hero.trade.id === supplyRules.matchingTrade[building.kind]
      ? supplyRules.production.tradeBonus[tradeLevel(hero.trade.hours) - 1]
      : 0;
  const inspected = t < building.inspectedUntil;
  const rate = base * share * (1 + tradeBonus) * (inspected ? 1 + supplyRules.production.inspectBonus : 1);
  return { quality: building.quality, base, share, tradeBonus, inspected, rate };
}

/** The building's output rate at a time, in units per hour. */
export const buildingRate = (save: SaveData, building: Building, t: number): number => buildingRateParts(save, building, t).rate;

/** Whole units the building's stock holds at `t`: capHours of full output (no bonus). */
export const buildingCap = (building: Building): number =>
  Math.floor(supplyRules.production.capHours * building.quality * supplyRules.buildings.kinds[building.kind].baseRate);

const stockTotal = (stock: Record<string, number>): number => Object.values(stock).reduce((sum, amount) => sum + amount, 0);

/** Whole units a building holds on hand. */
export const buildingStockTotal = (building: Building): number => stockTotal(building.stock);

/** Buildings whose settled stock has reached their cap, for the Network badges. */
export function buildingsAtCap(save: SaveData, now: number): number {
  return save.supply.buildings.filter((building) => buildingStockTotal(settleBuilding(save, building, now)) >= buildingCap(building)).length;
}

/** The material one made unit becomes: the kind's weighted roll from the unit count. */
const unitMaterial = (building: Building, made: number): string => {
  const makes = supplyRules.buildings.kinds[building.kind].makes;
  return createRng(`building|${building.id}|${made}`).weighted(Object.keys(makes), (material) => makes[material]);
};

/**
 * Settles a building from its last settlement to `now`, in pieces split at every
 * point the rate can change (the inspection ending, a closure), so settling
 * once or many times over a span gives the same building.
 */
export function settleBuilding(save: SaveData, building: Building, now: number): Building {
  if (now <= building.settledAt) return building;
  const cuts = [building.settledAt];
  for (const t of [building.inspectedUntil, building.closedUntil]) {
    if (t > building.settledAt && t < now) cuts.push(t);
  }
  cuts.push(now);
  cuts.sort((a, b) => a - b);

  let { stock, progress, made } = building;
  for (let i = 1; i < cuts.length; i++) {
    const from = cuts[i - 1];
    const rate = buildingRate(save, building, from);
    if (rate <= 0) continue;
    progress += (rate * (cuts[i] - from)) / HOUR;
    const cap = buildingCap(building);
    while (progress >= 1) {
      if (stockTotal(stock) >= cap) {
        progress = 0;
        break;
      }
      const material = unitMaterial(building, made);
      stock = { ...stock, [material]: (stock[material] ?? 0) + 1 };
      made += 1;
      progress -= 1;
    }
  }
  return { ...building, stock, progress, made, settledAt: now };
}

/**
 * Settles every building to `now`, and adds the trade hours a posted hero put in
 * where their trade is used: a matching building, or any building for a Watchman.
 * Returns the same save when nothing changed.
 */
export function settleBuildings(save: SaveData, now: number): SaveData {
  const buildings = save.supply.buildings;
  if (buildings.length === 0) return save;
  const settledBuildings = buildings.map((building) => settleBuilding(save, building, now));
  const heroes = save.heroes.map((hero) => {
    const hours = buildings.reduce((sum, building) => {
      if (building.heroId !== hero.id) return sum;
      if (hero.trade.id !== supplyRules.matchingTrade[building.kind] && hero.trade.id !== 'watchman') return sum;
      const from = Math.max(building.settledAt, building.postedAt ?? building.settledAt);
      return sum + Math.max(0, now - from) / HOUR;
    }, 0);
    return hours > 0 ? { ...hero, trade: { ...hero.trade, hours: hero.trade.hours + hours } } : hero;
  });
  if (settledBuildings.every((building, i) => building === buildings[i]) && heroes.every((hero, i) => hero === save.heroes[i])) return save;
  return { ...save, heroes, supply: { ...save.supply, buildings: settledBuildings } };
}
