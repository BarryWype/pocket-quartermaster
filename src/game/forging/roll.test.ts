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

  it('keeps the quality order intact across the whole roll range', () => {
    for (let q = 0; q < QUALITIES.length - 1; q++) {
      const lower = qualities[QUALITIES[q]].multiplier;
      const higher = qualities[QUALITIES[q + 1]].multiplier;
      expect(lower * max).toBeLessThan(higher * min);
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

  it('tilts towards the top with mastery, so about two thirds of rolls at the cap land in the upper half', () => {
    const count = (level: number) => {
      let upper = 0;
      for (let i = 0; i < FORGES; i++) {
        const roll = rollStatFactor(`tilt${level}|${i}`, level, 1);
        if (roll > (min + max) / 2) upper++;
      }
      return upper / FORGES;
    };
    // At the tier's mastery cap the tilt is at its full strength.
    expect(count(masteryCap(1, masteryRules))).toBeGreaterThan(0.6);
    expect(count(masteryCap(1, masteryRules))).toBeLessThan(0.75);
    // At level 1 the tilt barely moves the rolls away from even.
    expect(count(1)).toBeGreaterThan(0.42);
    expect(count(1)).toBeLessThan(0.58);
  });

  it('shows the roll on the 1–7 scale, 4 about neutral', () => {
    expect(rollToScale(min)).toBe(1);
    expect(rollToScale(1)).toBe(4);
    expect(rollToScale(max)).toBe(7);
  });
});
