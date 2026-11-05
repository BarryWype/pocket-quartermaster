import { itemById } from '@/content/lookup';
import { gearRules } from '@/content/gear';
import { newHero } from '@/content/heroes';
import { trinketKinds, trinketId } from '@/content/trinkets';
import type { GearDef } from '@/game/types';

import { createInitialSave, type SaveData } from '../save';
import { createRng } from '../generation/rng';
import { approachScore, gearApproachBonus } from '../team/stats';
import { equip } from '../team/team';
import { rollLootTrinket, trinketEffect } from './trinkets';
import type { LootRequest } from './roll';
import type { LootSourceId } from './types';

const context = (playerTier: number) => ({
  playerTier,
  pickaxeTier: 3,
  knownRecipes: [] as string[],
  favourCounts: {},
  mastery: {},
});

const request = (source: LootSourceId, seed: string, overrides: Partial<LootRequest> = {}): LootRequest => ({
  source,
  tier: 3,
  enemies: [],
  base: { gold: 0, xp: 0 },
  context: context(3),
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
  ...overrides,
});

const trinket = (kind: string, tier: number): GearDef => itemById[trinketId(kind, tier)] as GearDef;

/** Values at the lowest, middle and highest dice total of a Common piece, then the top of a Legendary one. */
const byRoll = (item: GearDef, pick: (effect: ReturnType<typeof trinketEffect>) => number) =>
  [3, 10, 18].map((roll) => pick(trinketEffect(item, { roll, rarity: 'common' }))).concat(
    pick(trinketEffect(item, { roll: 16, rarity: 'legendary' })),
  );

describe('the trinket catalogue', () => {
  it('holds one trinket per kind and tier, all in the trinket slot', () => {
    expect(trinketKinds).toHaveLength(14);
    expect(trinketKinds.flatMap((kind) => [1, 2, 3, 4, 5].map((tier) => trinketId(kind.kind, tier)))).toHaveLength(70);
    for (const id of trinketKinds.flatMap((kind) => [1, 2, 3, 4, 5].map((tier) => trinketId(kind.kind, tier)))) {
      expect(itemById[id].slot).toBe('trinket');
    }
  });

  it('scales the stat trinkets and amulets with the dice factor', () => {
    for (const [kind, pick] of [
      ['hawkEyeRing', (e: ReturnType<typeof trinketEffect>) => e.stats.crit!],
      ['shadowPin', (e: ReturnType<typeof trinketEffect>) => e.stats.evasion!],
      ['fireAmulet', (e: ReturnType<typeof trinketEffect>) => e.elementResist!.amount],
    ] as const) {
      for (const tier of [1, 3, 5]) {
        const item = trinket(kind, tier);
        const base = kind === 'fireAmulet' ? item.elementResist!.amount : (item.stats.crit ?? item.stats.evasion)!;
        const [low, mid, high, legendary] = byRoll(item, pick);
        expect(low).toBe(Math.round(base * gearRules.statRange.min));
        expect(high).toBe(Math.round(base * gearRules.statRange.max));
        expect(low).toBeLessThanOrEqual(mid);
        expect(mid).toBeLessThanOrEqual(high);
        expect(legendary).toBe(high);
      }
    }
  });

  it('leaves the ring of fortune Luck flat and gives talismans their approach', () => {
    expect(byRoll(trinket('ringOfFortune', 1), (e) => e.stats.luck!)).toEqual([2, 2, 2, 2]);
    expect(byRoll(trinket('ringOfFortune', 3), (e) => e.stats.luck!)).toEqual([3, 3, 3, 3]);
    expect(byRoll(trinket('ringOfFortune', 5), (e) => e.stats.luck!)).toEqual([4, 4, 4, 4]);
    expect(trinketEffect(trinket('oxTalisman', 2), { roll: 10, rarity: 'rare' })).toEqual({ stats: {}, approach: 'might' });
  });
});

describe('looted trinkets', () => {
  it('only drops the ring of fortune on a Legendary roll, and never from patrols', () => {
    const rolls = (source: LootSourceId) =>
      Array.from({ length: 3000 }, (_, i) => rollLootTrinket(request(source, `${source}${i}`)));
    for (const piece of rolls('tierBoss')) {
      if (piece.itemId.startsWith('ringOfFortune')) expect(piece.rarity).toBe('legendary');
    }
    expect(rolls('patrol').some((piece) => piece.itemId.startsWith('ringOfFortune'))).toBe(false);
  });

  it('shares the talismans between 10% and 25% of non-legendary rolls', () => {
    const rolls = [...Array.from({ length: 3000 }, (_, i) => rollLootTrinket(request('tierBoss', `b${i}`))),
      ...Array.from({ length: 3000 }, (_, i) => rollLootTrinket(request('patrol', `p${i}`)))];
    const plain = rolls.filter((piece) => piece.rarity !== 'legendary');
    const talismans = plain.filter((piece) => piece.itemId.includes('Talisman')).length;
    expect(talismans / plain.length).toBeGreaterThan(0.1);
    expect(talismans / plain.length).toBeLessThan(0.25);
  });

  it('uses the request element for an amulet', () => {
    const rolls = Array.from({ length: 300 }, (_, i) => rollLootTrinket(request('tierBoss', `f${i}`, { element: 'fire' })));
    const amulets = rolls.filter((piece) => piece.itemId.includes('Amulet'));
    expect(amulets.length).toBeGreaterThan(0);
    for (const piece of amulets) expect(piece.itemId).toMatch(/^fireAmulet\d$/);
  });

  it('follows the gear tier rules', () => {
    for (const piece of Array.from({ length: 50 }, (_, i) => rollLootTrinket(request('dungeonRun', `d${i}`, { tier: 4 })))) {
      expect(piece.itemId).toMatch(/4$/);
      expect(piece.uid).toBe('');
    }
  });
});

describe('trinkets on a hero', () => {
  const saveWithTalisman = (hero = createInitialSave().heroes.find((h) => h.id === 'bram')!): SaveData => {
    const base = createInitialSave();
    const save: SaveData = { ...base, heroes: [...base.heroes.filter((h) => h.id !== hero.id), hero], gear: [{ uid: 't1', itemId: 'oxTalisman1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }] };
    return equip(save, hero.id, 'trinket', 't1');
  };

  it('adds the talisman approach, capped at 5', () => {
    const atCap = { ...newHero('cap', 'Cap', 'barbarian', 'resilient'), approachPicks: ['might' as const] };
    const capped = saveWithTalisman(atCap);
    const fromCap = capped.heroes.find((h) => h.id === 'cap')!;
    expect(approachScore(fromCap, 'might', gearApproachBonus(capped, fromCap))).toBe(5);

    const plain = saveWithTalisman();
    const bram = plain.heroes.find((h) => h.id === 'bram')!;
    expect(approachScore(bram, 'might', gearApproachBonus(plain, bram))).toBe(4);
  });
});
