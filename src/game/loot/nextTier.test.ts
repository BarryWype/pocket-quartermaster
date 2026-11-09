import { classAffinities, gearProfiles } from '@/content/equipment';
import type { GearType } from '@/game/types';

import { createRng } from '../generation/rng';
import { createInitialSave } from '../save';
import { nextTierReward } from './nextTier';

describe('nextTierReward', () => {
  const save = createInitialSave();

  it("teaches the next tier's armour and helmet blueprints the player lacks", () => {
    const loot = nextTierReward({ ...save, knownRecipes: [...save.knownRecipes, 'mail3'] }, 2, createRng('a'));
    expect(loot.recipeIds).toContain('plate3');
    expect(loot.recipeIds).toContain('runeCirclet3');
    expect(loot.recipeIds).not.toContain('mail3');
    expect(loot.recipeIds.every((id) => ['armor', 'helmet'].includes(gearProfiles[id.slice(0, -1) as GearType].slot))).toBe(true);
  });

  it('gives one next-tier piece of a type a roster hero favours, at least Uncommon', () => {
    for (let i = 0; i < 30; i++) {
      const [piece] = nextTierReward(save, 1, createRng(`s${i}`)).gear;
      const type = piece.itemId.slice(0, -1) as GearType;
      expect(piece.itemId.endsWith('2')).toBe(true);
      expect(save.heroes.some((h) => (classAffinities[h.classId] as Partial<Record<GearType, string>>)[type] === 'favoured')).toBe(true);
      expect(piece.rarity).not.toBe('common');
    }
  });

  it('gives nothing after the last tier', () => {
    const loot = nextTierReward(save, 5, createRng('a'));
    expect(loot.recipeIds).toEqual([]);
    expect(loot.gear).toEqual([]);
  });
});
