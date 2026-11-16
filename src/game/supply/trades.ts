import { TRADE_IDS, supplyRules, type TradeId } from '@/content/supplyLines';

import { createRng } from '../generation/rng';

/** The trade a hero id rolls, at even weights: the same id always rolls the same one. */
export const rolledTrade = (seedId: string): TradeId => createRng(`trade|${seedId}`).weighted(TRADE_IDS, () => 1);

/** A trade's level from the hours spent using it (see supplyRules.trade.levelHours). */
export const tradeLevel = (hours: number): 1 | 2 | 3 => {
  const [, two, three] = supplyRules.trade.levelHours;
  return hours >= three ? 3 : hours >= two ? 2 : 1;
};
