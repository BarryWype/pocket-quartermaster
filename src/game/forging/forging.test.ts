import { salvageRules } from '@/content/forging';
import { affinityRules } from '@/content/equipment';
import { gearRules } from '@/content/gear';
import { items } from '@/content/items';
import { heroClasses } from '@/content/heroes';

import type { GearDef, GearInstance, GearType, StatKey } from '../types';
import { gearStats, SCALING_KEYS, statFactor, statRange } from '../gear/stats';
import { createInitialSave, type SaveData } from '../save';
import { equip, heroStats } from '../team/team';
import { canSalvage, salvage, salvageReturns } from './salvage';

const gearItems = items.filter((i): i is GearDef => i.slot === 'weapon' || i.slot === 'armor');
const piece = (itemId: string, rarity: GearInstance['rarity'] = 'common', extra: Partial<GearInstance> = {}): GearInstance => ({
  uid: 'g1',
  itemId,
  rarity,
  roll: 8,
  affixes: [],
  rerolls: 0,
  ...extra,
});

describe('gear stats', () => {
  it('multiplies the scaling stats of the piece by the dice factor, the extras stay flat', () => {
    const armour = items.find((i) => i.id === 'mail4') as GearDef;
    const scaled = (multiplier: number) =>
      Object.fromEntries(Object.entries(armour.stats).map(([key, value]) => [key, SCALING_KEYS.includes(key as StatKey) ? value! * multiplier : value]));
    expect(gearStats(piece('mail4', 'common', { roll: 3 }))).toEqual(scaled(gearRules.statRange.min));
    expect(gearStats(piece('mail4', 'common', { roll: 18 }))).toEqual(scaled(gearRules.statRange.max));
  });

  it('nudges the dice up by rarity, never past the top', () => {
    expect(statFactor(10, 'rare')).toBe(statFactor(11, 'common'));
    expect(statFactor(10, 'legendary')).toBe(statFactor(12, 'common'));
    expect(statFactor(18, 'legendary')).toBe(gearRules.statRange.max);
  });

  it('shows what equipping the piece adds to a usable hero', () => {
    for (const roll of [3, 10, 18]) {
      const base = createInitialSave();
      const ranger = base.heroes.find((h) => h.classId === 'ranger')!;
      const armed = equip({ ...base, gear: [piece('sword1', 'common', { roll })] }, ranger.id, 'weapon', 'g1');
      const unarmed = heroStats(base, ranger);
      const withSword = heroStats(armed, armed.heroes.find((h) => h.id === ranger.id)!);
      expect(withSword.crit - unarmed.crit).toBe(gearStats(piece('sword1', 'common', { roll })).crit);
    }
  });

  it('applies class affinity on top', () => {
    const sword = items.find((i) => i.id === 'sword4') as GearDef;
    const save = (roll: number) => equip({ ...createInitialSave(), gear: [piece('sword4', 'common', { roll })] }, 'bram', 'weapon', 'g1');
    const bram = (s: SaveData) => heroStats(s, s.heroes.find((h) => h.id === 'bram')!);
    const base = heroClasses.warrior.baseStats.power;
    expect(bram(save(18)).power).toBe(Math.round(base + sword.stats.power! * gearRules.statRange.max * affinityRules.favoured));
  });

  it('makes a tier jump worth more than rarity on average', () => {
    const mainStat = (item: GearDef) => (item.slot === 'armor' ? 'armour' : item.gearType === 'wand' ? 'magic' : 'power');
    const lines: GearType[] = ['sword', 'bow', 'wand', 'mail'];
    const meanFactor = (rarity: GearInstance['rarity']) => statFactor(10.5, rarity);
    for (const line of lines) {
      const byTier = gearItems.filter((i) => (i.gearType ?? 'mail') === line).sort((a, b) => a.tier - b.tier);
      for (let n = 0; n < byTier.length - 1; n++) {
        const [current, next] = [byTier[n], byTier[n + 1]];
        const stat = mainStat(current);
        expect(current.stats[stat]! * meanFactor('legendary')).toBeLessThan(next.stats[stat]! * meanFactor('common'));
      }
    }
  });

  it('ranges a forge preview over the dice at the rarity', () => {
    expect(statRange(10, 'common')).toEqual({ min: 8, max: 14 });
    expect(statRange(1, 'common')).toEqual({ min: 1, max: 1 });
    expect(statRange(0, 'legendary')).toEqual({ min: 0, max: 0 });
  });
});

describe('salvage', () => {
  it('returns a share of the recipe by rarity, rounded down', () => {
    // Stone-scale mail: 1 bone, 1 hide and 4 stone.
    expect(salvageReturns(piece('mail2', 'common'))).toEqual([
      { materialId: 'bone', amount: 1 },
      { materialId: 'stone', amount: 1 },
    ]);
    expect(salvageReturns(piece('mail2', 'rare'))).toEqual([
      { materialId: 'bone', amount: 1 },
      { materialId: 'stone', amount: 2 },
    ]);
  });

  it('always gives back at least 1 of the first input', () => {
    expect(salvageReturns(piece('sword1', 'common'))).toEqual([{ materialId: 'wood', amount: 1 }]);
  });

  it('raises the recipe share with the Salvage track', () => {
    const bonus = 0.15 * 2;
    expect(salvageReturns(piece('mail2', 'rare'), salvageRules, bonus)).toEqual([
      { materialId: 'bone', amount: 1 },
      { materialId: 'stone', amount: 3 },
    ]);
  });

  it('applies the Salvage track rank when salvaging', () => {
    const save: SaveData = { ...createInitialSave(), gear: [piece('mail2', 'rare')], guild: { salvage: 2 } };
    expect(salvage(save, 'g1').materials).toEqual({ bone: 1, stone: 3 });
  });

  it('destroys the piece', () => {
    const save: SaveData = { ...createInitialSave(), gear: [piece('sword1')] };
    const after = salvage(save, 'g1');
    expect(after.gear).toEqual([]);
    expect(after.materials).toEqual({ wood: 1 });
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
