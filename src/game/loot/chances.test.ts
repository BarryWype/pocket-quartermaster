import { difficultyRules } from '@/content/difficulty';
import { lootConfig } from '@/content/loot/config';

import { categoryChance, findGold, lootChances, partyLuck, runLengthMultiplier } from './chances';
import type { LootModifier, LootSourceId } from './types';

const input = (source: LootSourceId, overrides: Partial<Parameters<typeof lootChances>[0]> = {}) => ({
  source,
  luck: 0,
  modifiers: [] as LootModifier[],
  ...overrides,
});

describe('loot chances', () => {
  it('gives each mark its base chance', () => {
    // overnightExpedition: gold A, materials —, blueprints R, gear S, monsterParts O
    const chances = lootChances(input('overnightExpedition'));
    expect(chances.blueprints).toBeCloseTo(lootConfig.markChances.R);
    expect(chances.gear).toBeCloseTo(lootConfig.markChances.S);
    expect(chances.monsterParts).toBeCloseTo(lootConfig.markChances.O);
    expect(chances.gold).toBe(1);
    expect(chances.materials).toBe(0);
    expect(categoryChance('trinkets', input('dungeonRun'))).toBeCloseTo(lootConfig.markChances['R/2']);
    expect(categoryChance('gold', input('stepChest'))).toBe(1);
  });

  it('scales run length for run sources only', () => {
    expect(runLengthMultiplier('dungeonRun', 5)).toBe(0.25);
    expect(runLengthMultiplier('dungeonRun', 45)).toBe(1);
    expect(runLengthMultiplier('overnightExpedition', 480)).toBe(2);
    expect(runLengthMultiplier('overnightExpedition', 90)).toBe(2);
    expect(runLengthMultiplier('tierBoss', 5)).toBe(1);
    expect(runLengthMultiplier('tierBoss', 480)).toBe(1);
    expect(runLengthMultiplier('firstWin', 5)).toBe(1);
    expect(runLengthMultiplier('patrol', 5)).toBe(1);
    const gear = categoryChance('gear', input('dungeonRun', { minutes: 5 }));
    expect(gear).toBeCloseTo(0.25 * 0.25);
    expect(categoryChance('gear', input('firstWin', { minutes: 5 }))).toBeCloseTo(0.6);
  });

  it('caps stacked chances at 95%', () => {
    const modifiers: LootModifier[] = [{ id: 'c', kind: 'chance', category: 'gear', multiplier: 1.5 }];
    const chance = categoryChance(
      'gear',
      input('overnightExpedition', { minutes: 480, luck: 100, modifiers }),
    );
    expect(chance).toBe(0.95);
  });

  it('keeps A at 1 whatever multiplies it', () => {
    const modifiers: LootModifier[] = [{ id: 'c', kind: 'chance', category: 'gold', multiplier: 1.5 }];
    expect(
      categoryChance('gold', input('overnightExpedition', { minutes: 480, luck: 100, modifiers })),
    ).toBe(1);
  });

  it('raises non-A chances by 1% per Luck point, capped at +30%', () => {
    const base = categoryChance('gear', input('overnightExpedition'));
    expect(categoryChance('gear', input('overnightExpedition', { luck: 10 }))).toBeCloseTo(base * 1.1);
    const capped = categoryChance('gear', input('overnightExpedition', { luck: 30 }));
    expect(categoryChance('gear', input('overnightExpedition', { luck: 100 }))).toBeCloseTo(capped);
  });

  it('adds flat Luck modifiers and dedupes by id', () => {
    const twice: LootModifier[] = [
      { id: 'tooth', kind: 'luck', add: 5 },
      { id: 'tooth', kind: 'luck', add: 5 },
    ];
    expect(partyLuck(3, [{ id: 'a', kind: 'luck', add: 5 }])).toBe(8);
    expect(partyLuck(3, twice)).toBe(8);
    const base = categoryChance('gear', input('overnightExpedition'));
    expect(categoryChance('gear', input('overnightExpedition', { modifiers: twice }))).toBeCloseTo(
      base * 1.05,
    );
  });

  it('multiplies one category by its charm', () => {
    const modifiers: LootModifier[] = [
      { id: 'charm', kind: 'chance', category: 'gear', multiplier: 1.5 },
    ];
    const base = categoryChance('gear', input('overnightExpedition'));
    expect(categoryChance('gear', input('overnightExpedition', { modifiers }))).toBeCloseTo(base * 1.5);
    expect(categoryChance('relics', input('overnightExpedition', { modifiers }))).toBeCloseTo(
      categoryChance('relics', input('overnightExpedition')),
    );
  });

  it('pays a dungeon row\'s finds as gold, scaled like a drop chance', () => {
    // dungeonRun tier 1, easy, 5 min: 8 × 1 × (0.25 × 0.25) = 0.5, rounded half up.
    expect(findGold('dungeonRun', 1, 5, 'easy')).toBe(1);
    // tierBoss tier 2: 8 × 1.9 × 0.6 = 9.12.
    expect(findGold('tierBoss', 2)).toBe(9);
    // overnight 480 min: the chance caps at 0.95, so 8 × 1 × 0.95 = 7.6.
    expect(findGold('overnightExpedition', 1, 480)).toBe(8);
    // Hard raises the chance: 8 × 1 × (0.25 × 1.5) = 3.
    expect(findGold('dungeonRun', 1, 45, 'hard')).toBe(3);
    expect(findGold('patrol', 1)).toBe(0);
  });

  it('scales the treasure spot by map rarity', () => {
    const gear = categoryChance('gear', input('treasureSpot', { mapRarity: 'rare' }));
    expect(gear).toBeCloseTo(0.25 * 1.5);
    expect(categoryChance('gear', input('treasureSpot', { mapRarity: 'legendary' }))).toBeCloseTo(
      0.25 * 2.5,
    );
    expect(categoryChance('relics', input('treasureSpot', { mapRarity: 'common' }))).toBe(0);
    expect(categoryChance('trophies', input('treasureSpot', { mapRarity: 'rare' }))).toBe(0);
    expect(categoryChance('trophies', input('treasureSpot', { mapRarity: 'legendary' }))).toBeCloseTo(
      0.07 * 2.5,
    );
  });

  it('applies an explicit chance multiplier (step chests)', () => {
    const base = categoryChance('gear', input('stepChest'));
    expect(categoryChance('gear', input('stepChest', { chanceMultiplier: 1.5 }))).toBeCloseTo(
      base * 1.5,
    );
  });

  it('multiplies non-A chances by the difficulty, still capped', () => {
    const base = categoryChance('gear', input('overnightExpedition'));
    for (const difficulty of difficultyRules.order) {
      expect(categoryChance('gear', input('overnightExpedition', { difficulty }))).toBeCloseTo(
        base * difficultyRules.rewards[difficulty].chance,
      );
    }
    expect(categoryChance('gold', input('overnightExpedition', { difficulty: 'hard' }))).toBe(1);
    expect(
      categoryChance('gear', input('overnightExpedition', { minutes: 480, luck: 100, difficulty: 'hard' })),
    ).toBe(lootConfig.maxChance);
  });
});
