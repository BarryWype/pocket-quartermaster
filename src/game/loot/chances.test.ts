import { lootConfig } from '@/content/loot/config';

import { categoryChance, lootChances, partyLuck, runLengthMultiplier } from './chances';
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
    expect(categoryChance('monsterParts', input('patrolHerd'))).toBe(1);
  });

  it('scales run length for run sources only', () => {
    expect(runLengthMultiplier('dungeonRun', 5)).toBe(0.25);
    expect(runLengthMultiplier('dungeonRun', 45)).toBe(1);
    expect(runLengthMultiplier('overnightExpedition', 480)).toBe(2);
    expect(runLengthMultiplier('overnightExpedition', 90)).toBe(2);
    expect(runLengthMultiplier('tierBoss', 5)).toBe(1);
    expect(runLengthMultiplier('tierBoss', 480)).toBe(1);
    expect(runLengthMultiplier('firstWin', 5)).toBe(1);
    expect(runLengthMultiplier('patrolGoblins', 5)).toBe(1);
    const gear = categoryChance('gear', input('dungeonRun', { minutes: 5 }));
    expect(gear).toBeCloseTo(0.25 * 0.25);
    expect(categoryChance('gear', input('firstWin', { minutes: 5 }))).toBeCloseTo(0.25);
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
    expect(categoryChance('valuables', input('overnightExpedition', { modifiers }))).toBeCloseTo(
      categoryChance('valuables', input('overnightExpedition')),
    );
  });

  it('scales the treasure spot by map rarity', () => {
    const gear = categoryChance('gear', input('treasureSpot', { mapRarity: 'rare' }));
    expect(gear).toBeCloseTo(0.25 * 1.5);
    expect(categoryChance('gear', input('treasureSpot', { mapRarity: 'legendary' }))).toBeCloseTo(
      0.25 * 2.5,
    );
    expect(categoryChance('relics', input('treasureSpot', { mapRarity: 'common' }))).toBe(0);
    expect(categoryChance('components', input('treasureSpot', { mapRarity: 'rare' }))).toBe(0);
    expect(categoryChance('components', input('treasureSpot', { mapRarity: 'legendary' }))).toBeCloseTo(
      0.07 * 2.5,
    );
  });

  it('applies an explicit chance multiplier (step chests)', () => {
    const base = categoryChance('gear', input('stepChest'));
    expect(categoryChance('gear', input('stepChest', { chanceMultiplier: 1.5 }))).toBeCloseTo(
      base * 1.5,
    );
  });
});
