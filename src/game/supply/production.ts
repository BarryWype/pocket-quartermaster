import { jobById } from '@/content/jobs';
import { campResource, supplyRules } from '@/content/supplyLines';

import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import { periodAt } from './period';
import { cellRichness } from './richness';
import { tradeLevel } from './trades';
import type { Camp } from './types';

const HOUR = 3_600_000;
const PERIOD_MS = supplyRules.periodWeeks * 7 * 24 * HOUR;

/** A camp's richness at a time, at the period the offset picks. */
const richnessAt = (camp: Camp, t: number, periodOffset: number): 0 | 1 | 2 | 3 =>
  cellRichness(camp.cell, periodAt(t) + periodOffset, camp.terrain, campResource[camp.kind]);

export type CampRateParts = {
  richness: number;
  /** Richness × the base rate: the full rate before shares and bonuses. */
  base: number;
  /** 1 with a hero posted, the locals' share without one. */
  share: number;
  tradeBonus: number;
  inspected: boolean;
  rate: number;
};

/** The camp's output rate at a time, broken into its parts for display. */
export function campRateParts(save: SaveData, camp: Camp, t: number, periodOffset = 0): CampRateParts {
  if (t < camp.closedUntil) return { richness: 0, base: 0, share: 0, tradeBonus: 0, inspected: false, rate: 0 };
  const richness = richnessAt(camp, t, periodOffset);
  const base = richness * supplyRules.production.baseRate[camp.kind];
  const hero = camp.heroId ? save.heroes.find((h) => h.id === camp.heroId) : undefined;
  const share = hero ? 1 : supplyRules.production.localsShare;
  const tradeBonus =
    hero && hero.trade.id === supplyRules.matchingTrade[camp.kind]
      ? supplyRules.production.tradeBonus[tradeLevel(hero.trade.hours) - 1]
      : 0;
  const inspected = t < camp.inspectedUntil;
  const rate = base * share * (1 + tradeBonus) * (inspected ? 1 + supplyRules.production.inspectBonus : 1);
  return { richness, base, share, tradeBonus, inspected, rate };
}

/** The camp's output rate at a time, in units per hour. */
export const campRate = (save: SaveData, camp: Camp, t: number, periodOffset = 0): number =>
  campRateParts(save, camp, t, periodOffset).rate;

/** Whole units the camp's stock holds at `t`: capHours of full output (no bonus). */
export const campCap = (camp: Camp, t: number, periodOffset = 0): number =>
  Math.floor(supplyRules.production.capHours * richnessAt(camp, t, periodOffset) * supplyRules.production.baseRate[camp.kind]);

const stockTotal = (stock: Record<string, number>): number => Object.values(stock).reduce((sum, amount) => sum + amount, 0);

/** Whole units a camp holds on hand. */
export const campStockTotal = (camp: Camp): number => stockTotal(camp.stock);

/** Camps whose settled stock has reached their cap, for the Network badges. */
export function campsAtCap(save: SaveData, now: number, periodOffset = 0): number {
  return save.supply.camps.filter((camp) => campStockTotal(settleCamp(save, camp, now, periodOffset)) >= campCap(camp, now, periodOffset)).length;
}

/** The material one made unit becomes: wood, or the trapper job's weighted roll from the unit count. */
const unitMaterial = (camp: Camp, made: number): string => {
  if (camp.kind === 'timber') return 'wood';
  const produces = jobById.trapper.produces;
  if (typeof produces === 'string' || !('weights' in produces)) throw new Error('The trapper job lost its produce weights');
  return createRng(`camp|${camp.id}|${made}`).weighted(Object.keys(produces.weights), (material) => produces.weights[material]);
};

/**
 * Settles a camp from its last settlement to `now`, in pieces split at every
 * point the rate can change (the inspection ending, a closure, a period
 * boundary), so settling once or many times over a span gives the same camp.
 */
export function settleCamp(save: SaveData, camp: Camp, now: number, periodOffset = 0): Camp {
  if (now <= camp.settledAt) return camp;
  const cuts = [camp.settledAt];
  for (const t of [camp.inspectedUntil, camp.closedUntil]) {
    if (t > camp.settledAt && t < now) cuts.push(t);
  }
  for (let k = Math.floor(camp.settledAt / PERIOD_MS) + 1; k * PERIOD_MS < now; k++) cuts.push(k * PERIOD_MS);
  cuts.push(now);
  cuts.sort((a, b) => a - b);

  let { stock, progress, made } = camp;
  for (let i = 1; i < cuts.length; i++) {
    const from = cuts[i - 1];
    const rate = campRate(save, camp, from, periodOffset);
    if (rate <= 0) continue;
    progress += (rate * (cuts[i] - from)) / HOUR;
    const cap = campCap(camp, from, periodOffset);
    while (progress >= 1) {
      if (stockTotal(stock) >= cap) {
        progress = 0;
        break;
      }
      const material = unitMaterial(camp, made);
      stock = { ...stock, [material]: (stock[material] ?? 0) + 1 };
      made += 1;
      progress -= 1;
    }
  }
  return { ...camp, stock, progress, made, settledAt: now };
}

/**
 * Settles every camp to `now`, and adds the trade hours a posted hero put in
 * where their trade is used: a matching camp, or any camp for a Watchman.
 * Returns the same save when nothing changed.
 */
export function settleCamps(save: SaveData, now: number, periodOffset = 0): SaveData {
  const camps = save.supply.camps;
  if (camps.length === 0) return save;
  const settledCamps = camps.map((camp) => settleCamp(save, camp, now, periodOffset));
  const heroes = save.heroes.map((hero) => {
    const hours = camps.reduce((sum, camp) => {
      if (camp.heroId !== hero.id) return sum;
      if (hero.trade.id !== supplyRules.matchingTrade[camp.kind] && hero.trade.id !== 'watchman') return sum;
      const from = Math.max(camp.settledAt, camp.postedAt ?? camp.settledAt);
      return sum + Math.max(0, now - from) / HOUR;
    }, 0);
    return hours > 0 ? { ...hero, trade: { ...hero.trade, hours: hero.trade.hours + hours } } : hero;
  });
  if (settledCamps.every((camp, i) => camp === camps[i]) && heroes.every((hero, i) => hero === save.heroes[i])) return save;
  return { ...save, heroes, supply: { ...save.supply, camps: settledCamps } };
}
