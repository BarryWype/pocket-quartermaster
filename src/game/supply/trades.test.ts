import { TRADE_IDS, supplyRules } from '@/content/supplyLines';

import { rolledTrade, tradeLevel } from './trades';

describe('rolledTrade', () => {
  it('rolls the same trade for the same id every time', () => {
    expect(rolledTrade('h1')).toBe(rolledTrade('h1'));
    expect(rolledTrade('bram')).toBe(rolledTrade('bram'));
  });

  it('covers every trade over many ids', () => {
    const rolled = new Set(Array.from({ length: 200 }, (_, i) => rolledTrade(`h${i}`)));
    expect([...rolled].sort()).toEqual([...TRADE_IDS].sort());
  });
});

describe('tradeLevel', () => {
  const [, level2, level3] = supplyRules.trade.levelHours;

  it('levels exactly at the configured hour thresholds', () => {
    expect(tradeLevel(0)).toBe(1);
    expect(tradeLevel(level2 - 1)).toBe(1);
    expect(tradeLevel(level2)).toBe(2);
    expect(tradeLevel(level3 - 1)).toBe(2);
    expect(tradeLevel(level3)).toBe(3);
  });
});
