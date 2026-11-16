import { supplyRules } from '@/content/supplyLines';

import { distanceMeters } from '../generation/geo';
import { tileCenter } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import { isBusy } from '../team/team';
import { campStockTotal, settleCamps } from './production';

const HOUR = 3_600_000;

export type PostProblem = 'unknown' | 'taken' | 'busy' | null;

/** Why a hero cannot be posted at a camp now, or null. */
export function postProblem(save: SaveData, campId: string, heroId: string, now: number): PostProblem {
  const camp = save.supply.camps.find((c) => c.id === campId);
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!camp || !hero) return 'unknown';
  if (camp.heroId === heroId) return null;
  if (camp.heroId) return 'taken';
  if (isBusy(save, heroId)) return 'busy';
  return null;
}

/** Posts a hero at a camp: it runs at the full rate, with their trade's bonus. */
export function postHero(save: SaveData, campId: string, heroId: string, now: number): SaveData {
  const problem = postProblem(save, campId, heroId, now);
  if (problem) throw new Error(`Cannot post ${heroId} at ${campId}: ${problem}`);
  const settled = settleCamps(save, now);
  return {
    ...settled,
    supply: {
      ...settled.supply,
      camps: settled.supply.camps.map((c) => (c.id === campId ? { ...c, heroId, postedAt: now } : c)),
    },
  };
}

/** Recalls a posted hero: their camp keeps running with the locals. */
export function recallPosted(save: SaveData, heroId: string, now: number): SaveData {
  const settled = settleCamps(save, now);
  if (!settled.heroes.some((h) => h.id === heroId)) throw new Error(`Unknown hero ${heroId}`);
  if (!settled.supply.camps.some((c) => c.heroId === heroId)) throw new Error(`Cannot recall ${heroId}: not posted`);
  return {
    ...settled,
    supply: {
      ...settled.supply,
      camps: settled.supply.camps.map((c) => (c.heroId === heroId ? { ...c, heroId: null, postedAt: null } : c)),
    },
  };
}

export type CollectProblem = 'unknown' | 'tooFar' | 'empty' | null;

/** Why a camp's stock cannot be collected now, or null. */
export function collectProblem(save: SaveData, campId: string, player: LatLng, now: number): CollectProblem {
  const settled = settleCamps(save, now);
  const camp = settled.supply.camps.find((c) => c.id === campId);
  if (!camp) return 'unknown';
  if (distanceMeters(player, tileCenter(camp.cell)) > supplyRules.production.collectMeters) return 'tooFar';
  if (campStockTotal(camp) === 0) return 'empty';
  return null;
}

/** Collects a camp's whole stock in person, inspecting it for the next while. */
export function collectCamp(save: SaveData, campId: string, player: LatLng, now: number): SaveData {
  const problem = collectProblem(save, campId, player, now);
  if (problem) throw new Error(`Cannot collect ${campId}: ${problem}`);
  const settled = settleCamps(save, now);
  const camp = settled.supply.camps.find((c) => c.id === campId)!;
  const stock = Object.entries(camp.stock).filter(([, amount]) => amount > 0);
  return {
    ...settled,
    materials: addMaterials(settled.materials, stock.map(([materialId, amount]) => ({ materialId, amount }))),
    supply: {
      ...settled.supply,
      camps: settled.supply.camps.map((c) =>
        c.id === campId ? { ...c, stock: {}, inspectedUntil: now + supplyRules.production.inspectHours * HOUR } : c,
      ),
    },
  };
}
