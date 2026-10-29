import { masteryRules, QUALITIES, qualities, salvageRules } from '@/content/forging';
import { affinityRules } from '@/content/equipment';
import { items } from '@/content/items';
import { recipeById } from '@/content/lookup';
import { heroClasses } from '@/content/heroes';

import { craft, forgeResult, unlockRecipe } from '../crafting/crafting';
import type { GearDef, GearInstance, MasteryType } from '../types';
import { createRng } from '../generation/rng';
import { migrateV5Save } from '../migrations';
import { createInitialSave, type SaveData } from '../save';
import { equip, heroStats } from '../team/team';
import { forgesForNextLevel, gainMastery, masteryCap, startingMastery } from './mastery';
import { gearStats, qualityOdds, rollQuality } from './quality';
import { canSalvage, salvage, salvageReturns } from './salvage';

const gearItems = items.filter((i): i is GearDef => i.slot === 'weapon' || i.slot === 'armor');
const piece = (itemId: string, quality: GearInstance['quality'] = 'normal', extra: Partial<GearInstance> = {}): GearInstance => ({
  uid: 'g1',
  itemId,
  quality,
  ...extra,
});

describe('mastery caps and odds', () => {
  it('caps mastery at 2 + 2 × tier', () => {
    expect([1, 2, 3, 4, 5].map((tier) => masteryCap(tier))).toEqual([4, 6, 8, 10, 12]);
  });

  it('gives odds by levels below the cap', () => {
    // Copper (cap 8), so the maxed row is the general one.
    expect(qualityOdds(5, 3)).toEqual({ crappy: 80, normal: 20, rare: 0, legendary: 0 });
    expect(qualityOdds(1, 3)).toEqual({ crappy: 80, normal: 20, rare: 0, legendary: 0 });
    expect(qualityOdds(6, 3)).toEqual({ crappy: 58, normal: 40, rare: 2, legendary: 0 });
    expect(qualityOdds(7, 3)).toEqual({ crappy: 30, normal: 65, rare: 5, legendary: 0 });
    expect(qualityOdds(8, 3)).toEqual({ crappy: 10, normal: 75, rare: 12, legendary: 3 });
  });

  it('makes Legendary rarer on cheap tiers once maxed', () => {
    expect(qualityOdds(4, 1)).toEqual({ crappy: 12, normal: 75, rare: 12, legendary: 1 });
    expect(qualityOdds(6, 2)).toEqual({ crappy: 11, normal: 75, rare: 12, legendary: 2 });
    expect(qualityOdds(10, 4)).toEqual({ crappy: 10, normal: 75, rare: 12, legendary: 3 });
    expect(qualityOdds(12, 5)).toEqual({ crappy: 10, normal: 75, rare: 12, legendary: 3 });
  });

  it("uses an older tier's maxed odds above its cap", () => {
    expect(qualityOdds(9, 1)).toEqual(qualityOdds(4, 1));
    expect(qualityOdds(12, 2)).toEqual(qualityOdds(6, 2));
  });

  it('adds every row up to 100%', () => {
    for (const row of [...masteryRules.odds, ...Object.values(masteryRules.maxedOddsByTier)]) {
      expect(QUALITIES.reduce((sum, q) => sum + row![q], 0)).toBe(100);
    }
  });
});

describe('mastery gain', () => {
  it('needs the band cost in forges per level', () => {
    expect([1, 3, 4, 5, 6, 8, 10, 11].map((level) => forgesForNextLevel(level))).toEqual([3, 3, 3, 3, 4, 4, 4, 4]);
    expect(forgesForNextLevel(12)).toBeNull();
  });

  it('counts one forge at a time and levels up at the band cost', () => {
    let state = { level: 1, progress: 0 };
    state = gainMastery(state, 1);
    expect(state).toEqual({ level: 1, progress: 1 });
    state = gainMastery(gainMastery(state, 1), 1);
    expect(state).toEqual({ level: 2, progress: 0 });
  });

  it('gives nothing at or above the item tier cap', () => {
    expect(gainMastery({ level: 4, progress: 0 }, 1)).toEqual({ level: 4, progress: 0 });
    expect(gainMastery({ level: 7, progress: 2 }, 2)).toEqual({ level: 7, progress: 2 });
  });

  it('still counts higher-tier forges far below their cap, at the current band cost', () => {
    expect(gainMastery({ level: 1, progress: 2 }, 5)).toEqual({ level: 2, progress: 0 });
  });

  it('starts a type first met through a later blueprint at the previous tier cap', () => {
    expect(startingMastery(1)).toEqual({ level: 1, progress: 0 });
    expect(startingMastery(3)).toEqual({ level: 6, progress: 0 });
    const { wand, ...others } = createInitialSave().mastery;
    expect(wand).toBeDefined();
    const save: SaveData = { ...createInitialSave(), mastery: others };
    expect(unlockRecipe(save, 'wand3').mastery.wand).toEqual({ level: 6, progress: 0 });
    // Known types keep their level.
    expect(unlockRecipe(createInitialSave(), 'wand3').mastery.wand).toEqual({ level: 1, progress: 0 });
  });

  it('takes the configured number of forges to max each tier', () => {
    const forgesToMax = (from: number, to: number) => {
      let state = { level: from, progress: 0 };
      let forges = 0;
      while (state.level < to) {
        state = gainMastery(state, 5);
        forges++;
      }
      return forges;
    };
    expect([forgesToMax(1, 4), forgesToMax(4, 6), forgesToMax(6, 8), forgesToMax(8, 10), forgesToMax(10, 12)]).toEqual([
      9, 6, 8, 8, 8,
    ]);
  });

  it('gives every tier the same maxed odds apart from the Legendary override', () => {
    const maxed = [1, 2, 3, 4, 5].map((tier) => qualityOdds(masteryCap(tier), tier));
    for (const odds of maxed) {
      expect(odds.normal).toBe(75);
      expect(odds.rare).toBe(12);
      expect(odds.crappy + odds.legendary).toBe(13);
    }
  });
});

describe('forging quality', () => {
  const withWood = (extra: Partial<SaveData> = {}): SaveData => ({ ...createInitialSave(), materials: { wood: 30 }, ...extra });

  it('rolls the same quality for the same save, so reopening cannot reroll', () => {
    const save = withWood({ nextUid: 42 });
    expect(craft(save, recipeById.sword1).gear[0].quality).toBe(craft(save, recipeById.sword1).gear[0].quality);
  });

  it('follows the odds over many forges', () => {
    const counts: Record<string, number> = {};
    for (let uid = 1; uid <= 2000; uid++) {
      const quality = craft(withWood({ nextUid: uid }), recipeById.sword1).gear[0].quality;
      counts[quality] = (counts[quality] ?? 0) + 1;
    }
    // Level 1 against the wood cap of 4: 3 below, so 80% Crappy and 20% Normal.
    expect(counts.crappy / 2000).toBeGreaterThan(0.75);
    expect(counts.crappy / 2000).toBeLessThan(0.85);
    expect(counts.rare ?? 0).toBe(0);
  });

  it('raises the mastery of the forged type and reports level-ups', () => {
    let save = withWood();
    for (let i = 0; i < 2; i++) save = craft(save, recipeById.sword1);
    const before = save;
    save = craft(save, recipeById.sword1);
    expect(save.mastery.sword).toEqual({ level: 2, progress: 0 });
    expect(save.mastery.bow).toEqual({ level: 1, progress: 0 });
    expect(forgeResult(before, save)).toMatchObject({ type: 'sword', levelUp: true, mastery: { level: 2 } });
  });

  it('can be forced from debug', () => {
    expect(craft(withWood(), recipeById.sword1, 'legendary').gear[0].quality).toBe('legendary');
  });

  it('rolls with the weighted odds', () => {
    const rng = createRng('x');
    for (let i = 0; i < 50; i++) expect(rollQuality({ crappy: 0, normal: 0, rare: 100, legendary: 0 }, rng)).toBe('rare');
  });
});

describe('quality stats', () => {
  it('multiplies every stat of the piece', () => {
    const armour = items.find((i) => i.id === 'mail4') as GearDef;
    const scaled = (multiplier: number) => Object.fromEntries(Object.entries(armour.stats).map(([key, value]) => [key, value! * multiplier]));
    expect(gearStats(armour, { quality: 'crappy' })).toEqual(scaled(0.85));
    expect(gearStats(armour, { quality: 'legendary' })).toEqual(scaled(1.3));
  });

  it('applies class affinity on top', () => {
    const sword = items.find((i) => i.id === 'sword4') as GearDef;
    const save = (quality: GearInstance['quality']) =>
      equip({ ...createInitialSave(), gear: [piece('sword4', quality)] }, 'bram', 'weapon', 'g1');
    const bram = (s: SaveData) => heroStats(s, s.heroes.find((h) => h.id === 'bram')!);
    const base = heroClasses.warrior.baseStats.power;
    expect(bram(save('normal')).power).toBe(Math.round(base + sword.stats.power! * affinityRules.favoured));
    expect(bram(save('rare')).power).toBe(Math.round(base + sword.stats.power! * 1.15 * affinityRules.favoured));
  });

  it('orders every quality within a tier, and a tier jump is worth more than quality', () => {
    const mainStat = (item: GearDef) => (item.slot === 'armor' ? 'armour' : item.gearType === 'wand' ? 'magic' : 'power');
    const lines: MasteryType[] = ['sword', 'bow', 'wand', 'mail'];
    for (const line of lines) {
      const byTier = gearItems
        .filter((i) => (i.gearType ?? 'mail') === line)
        .sort((a, b) => a.tier - b.tier);
      for (let n = 0; n < byTier.length - 1; n++) {
        const [current, next] = [byTier[n], byTier[n + 1]];
        const stat = mainStat(current);
        const value = (item: GearDef, quality: GearInstance['quality']) => item.stats[stat]! * qualities[quality].multiplier;
        expect(value(current, 'crappy')).toBeLessThan(value(current, 'legendary'));
        expect(value(current, 'legendary')).toBeLessThan(value(next, 'normal'));
      }
    }
  });
});

describe('salvage', () => {
  it('returns a share of the recipe by quality, rounded down', () => {
    // Stone-scale mail: 1 bone, 1 hide and 4 stone.
    expect(salvageReturns(piece('mail2', 'crappy'))).toEqual([
      { materialId: 'bone', amount: 1 },
      { materialId: 'stone', amount: 1 },
    ]);
    expect(salvageReturns(piece('mail2', 'normal'))).toEqual([
      { materialId: 'bone', amount: 1 },
      { materialId: 'stone', amount: 1 },
    ]);
    expect(salvageReturns(piece('mail2', 'rare'))).toEqual([
      { materialId: 'bone', amount: 1 },
      { materialId: 'stone', amount: 2 },
    ]);
  });

  it('always gives back at least 1 of the first input', () => {
    expect(salvageReturns(piece('sword1', 'crappy'))).toEqual([{ materialId: 'wood', amount: 1 }]);
  });

  it('gives shards back for infused and Legendary pieces', () => {
    expect(salvageReturns(piece('sword1', 'normal', { element: 'fire' }))).toEqual([
      { materialId: 'wood', amount: 1 },
      { materialId: 'fireShard', amount: salvageRules.infusedShards },
    ]);
    const legendary = salvageReturns(piece('sword4', 'legendary'));
    expect(legendary.slice(0, 2)).toEqual([
      { materialId: 'wood', amount: 1 },
      { materialId: 'iron', amount: 3 },
    ]);
    expect(legendary[2]).toEqual({ materialId: expect.stringMatching(/Shard$/), amount: 4 });
    expect(salvageReturns(piece('sword4', 'legendary'))).toEqual(legendary);
  });

  it('destroys the piece and merges shards into stones', () => {
    const save: SaveData = { ...createInitialSave(), gear: [piece('sword1', 'normal', { element: 'fire' })], materials: { fireShard: 5 } };
    const after = salvage(save, 'g1');
    expect(after.gear).toEqual([]);
    expect(after.materials).toEqual({ wood: 1, fireStone: 1 });
  });

  it('refuses gear that is worn, including on an expedition', () => {
    const worn = equip({ ...createInitialSave(), gear: [piece('sword1')] }, 'bram', 'weapon', 'g1');
    expect(canSalvage(worn, 'g1')).toBe(false);
    expect(() => salvage(worn, 'g1')).toThrow();
    const away: SaveData = {
      ...worn,
      expeditions: [{ id: 'x', dungeonId: 'ratCellar', heroIds: ['bram'], startedAt: 0, endsAt: 1, seed: 's', notificationId: null }],
    };
    expect(canSalvage(away, 'g1')).toBe(false);
  });
});

describe('save migration', () => {
  it('turns old gear Normal, starts mastery at 1 and swaps keys for Sigils', () => {
    const old = {
      ...createInitialSave(),
      gear: [{ uid: 'g1', itemId: 'sword1', durability: 3, element: 'fire' }],
      materials: { wood: 2, mysteriousKey: 1 },
      sigils: [2],
      mastery: undefined,
    } as unknown as Parameters<typeof migrateV5Save>[0];
    const save = migrateV5Save(old);
    expect(save.gear).toEqual([{ uid: 'g1', itemId: 'sword1', quality: 'normal', element: 'fire' }]);
    expect(save.materials).toEqual({ wood: 2 });
    expect(save.sigils).toEqual([2, 1]);
    expect(save.mastery).toEqual(createInitialSave().mastery);
  });

  it('keeps the Sigil cap', () => {
    const old = { ...createInitialSave(), materials: { mysteriousKey: 2 }, sigils: [1, 2] } as Parameters<typeof migrateV5Save>[0];
    expect(migrateV5Save(old).sigils).toEqual([1, 2, 1]);
  });
});
