import { supplyRules } from '@/content/supplyLines';

import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import { isBusy } from '../team/team';
import { buildingStockTotal, settleBuildings } from './production';

const HOUR = 3_600_000;

export type PostProblem = 'unknown' | 'taken' | 'busy' | null;

/** Why a hero cannot be posted at a building now, or null. */
export function postProblem(save: SaveData, buildingId: string, heroId: string, now: number): PostProblem {
  const building = save.supply.buildings.find((b) => b.id === buildingId);
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!building || !hero) return 'unknown';
  if (building.heroId === heroId) return null;
  if (building.heroId) return 'taken';
  if (isBusy(save, heroId)) return 'busy';
  return null;
}

/** Posts a hero at a building: it runs at the full rate, with their trade's bonus. */
export function postHero(save: SaveData, buildingId: string, heroId: string, now: number): SaveData {
  const problem = postProblem(save, buildingId, heroId, now);
  if (problem) throw new Error(`Cannot post ${heroId} at ${buildingId}: ${problem}`);
  const settled = settleBuildings(save, now);
  return {
    ...settled,
    supply: {
      ...settled.supply,
      buildings: settled.supply.buildings.map((b) => (b.id === buildingId ? { ...b, heroId, postedAt: now } : b)),
    },
  };
}

/** Recalls a posted hero: their building keeps running with the locals. */
export function recallPosted(save: SaveData, heroId: string, now: number): SaveData {
  const settled = settleBuildings(save, now);
  if (!settled.heroes.some((h) => h.id === heroId)) throw new Error(`Unknown hero ${heroId}`);
  if (!settled.supply.buildings.some((b) => b.heroId === heroId)) throw new Error(`Cannot recall ${heroId}: not posted`);
  return {
    ...settled,
    supply: {
      ...settled.supply,
      buildings: settled.supply.buildings.map((b) => (b.heroId === heroId ? { ...b, heroId: null, postedAt: null } : b)),
    },
  };
}

export type CollectProblem = 'unknown' | 'tooFar' | 'empty' | null;

/** Why a building's stock cannot be collected now, or null. */
export function collectProblem(save: SaveData, buildingId: string, player: LatLng, now: number): CollectProblem {
  const settled = settleBuildings(save, now);
  const building = settled.supply.buildings.find((b) => b.id === buildingId);
  if (!building) return 'unknown';
  if (distanceMeters(player, building.position) > supplyRules.production.collectMeters) return 'tooFar';
  if (buildingStockTotal(building) === 0) return 'empty';
  return null;
}

/** Collects a building's whole stock in person, inspecting it for the next while. */
export function collectBuilding(save: SaveData, buildingId: string, player: LatLng, now: number): SaveData {
  const problem = collectProblem(save, buildingId, player, now);
  if (problem) throw new Error(`Cannot collect ${buildingId}: ${problem}`);
  const settled = settleBuildings(save, now);
  const building = settled.supply.buildings.find((b) => b.id === buildingId)!;
  const stock = Object.entries(building.stock).filter(([, amount]) => amount > 0);
  return {
    ...settled,
    materials: addMaterials(settled.materials, stock.map(([materialId, amount]) => ({ materialId, amount }))),
    supply: {
      ...settled.supply,
      buildings: settled.supply.buildings.map((b) =>
        b.id === buildingId ? { ...b, stock: {}, inspectedUntil: now + supplyRules.production.inspectHours * HOUR } : b,
      ),
    },
  };
}
