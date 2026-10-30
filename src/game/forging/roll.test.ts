import { masteryRules, qualities, QUALITIES, rollRules } from '@/content/forging';
import { itemById, recipeById } from '@/content/lookup';

import { createInitialSave, type SaveData } from '../save';
import { craft } from '../crafting/crafting';
import { masteryCap } from './mastery';
import { rollStatFactor, rollToScale } from './roll';

const FORGES = 400;
const { min, max } = rollRules.range;

describe('stat rolls', () => {
  it('are deterministic per uid and stay in the configured range', () => {
    for (let i = 1; i <= 20; i++) {
      const uid = `g${i}`;
      const roll = rollStatFactor(uid, 1, 1);
      expect(roll).toBe(rollStatFactor(uid, 1, 1));
      expect(roll).toBeGreaterThanOrEqual(min);
      expect(roll).toBeLessThanOrEqual(max);
    }
  });

  it('keeps Crappy below Normal and Rare below Legendary across the roll range', () => {
    expect(qualities.crappy.multiplier * max).toBeLessThan(qualities.normal.multiplier * min);
    expect(qualities.rare.multiplier * max).toBeLessThan(qualities.legendary.multiplier * min);
    for (let q = 0; q < QUALITIES.length - 1; q++) {
      expect(qualities[QUALITIES[q]].multiplier).toBeLessThan(qualities[QUALITIES[q + 1]].multiplier);
    }
  });

  it('rolls on every forged piece, seeded by its uid', () => {
    const save: SaveData = { ...createInitialSave(), materials: { wood: FORGES * 4 + 4 }, tutorial: { step: 'done', woodSpot: null } };
    let next = save;
    const rolls: number[] = [];
    for (let i = 0; i < 30; i++) {
      next = craft(next, recipeById.sword1);
      const piece = next.gear.at(-1)!;
      expect(piece.roll).toBeDefined();
      rolls.push(piece.roll!);
    }
    // A uid's roll never changes, and different pieces don't all share one roll.
    expect(new Set(rolls).size).toBeGreaterThan(5);
    const item = itemById.sword1;
    if (item.slot === 'weapon' || item.slot === 'armor') {
      expect(rolls[0]).toBe(rollStatFactor('g1', 1, item.tier));
    }
  });

  it('centres the bell at low mastery and lifts the mean at the cap', () => {
    const mean = (level: number, tier: number) => {
      let sum = 0;
      for (let i = 0; i < 2000; i++) sum += rollStatFactor(`mean${level}|${i}`, level, tier);
      return sum / 2000;
    };
    // Steel's high cap leaves a new smith's rolls centred on the range's middle.
    expect(mean(1, 5)).toBeGreaterThan(0.995);
    expect(mean(1, 5)).toBeLessThan(1.005);
    expect(mean(masteryCap(1, masteryRules), 1)).toBeGreaterThan(1.02);
  });

  it('lands more rolls near the middle of the range than at the extremes', () => {
    let middle = 0;
    let extremes = 0;
    for (let i = 0; i < 2000; i++) {
      const roll = rollStatFactor(`bell|${i}`, 1, 1);
      if (roll >= 0.98 && roll <= 1.02) middle++;
      if ((roll >= 0.94 && roll <= 0.96) || (roll >= 1.04 && roll <= 1.06)) extremes++;
    }
    expect(middle).toBeGreaterThan(extremes);
  });

  it('shows the roll on the 1–7 scale, 4 about neutral', () => {
    expect(rollToScale(min)).toBe(1);
    expect(rollToScale(1)).toBe(4);
    expect(rollToScale(max)).toBe(7);
  });
});
