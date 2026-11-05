import { affixById } from '@/content/affixes';
import { gearProfiles } from '@/content/equipment';
import { gearRules, RARITIES } from '@/content/gear';
import { trinketId } from '@/content/trinkets';

import { ingredientAffixId } from '../forging/components';
import { stoneAffixId } from '../crafting/infusion';
import { createRng } from '../generation/rng';
import type { GearType } from '../types';
import { affixPool, affixSlotOf, affixValue, bestAffixValue, rollAffixes } from './affixes';
import { makeGearPiece } from './make';
import { uniquePool } from './uniques';

const slotOf = (id: string) => affixById[id].slot;

describe('affix pools', () => {
  it('gives weapons weapon and any-slot affixes, never stone affixes', () => {
    const pool = affixPool({ itemId: 'sword1' });
    expect(pool.every((a) => a.slot === 'weapon' || a.slot === 'any' || (typeof a.slot === 'object' && a.slot.types.includes('sword')))).toBe(true);
    expect(pool.some((a) => a.id === 'cleaving')).toBe(true);
    expect(pool.some((a) => a.id === 'staggering')).toBe(false);
    expect(pool.some((a) => a.source.kind === 'element')).toBe(false);
  });

  it('gives armour and off-hands their own affixes, and trinkets only the any-slot ones', () => {
    expect(affixPool({ itemId: 'plate1' }).every((a) => a.slot !== 'weapon')).toBe(true);
    expect(affixPool({ itemId: trinketId('hawkEyeRing', 1) }).every((a) => a.slot === 'any')).toBe(true);
  });
});

describe('affixSlotOf', () => {
  const expected: Record<GearType, 'weapon' | 'armourOffhand'> = {
    sword: 'weapon',
    axe: 'weapon',
    mace: 'weapon',
    dagger: 'weapon',
    bow: 'weapon',
    spear: 'weapon',
    warhammer: 'weapon',
    wand: 'weapon',
    staff: 'weapon',
    lute: 'weapon',
    censer: 'weapon',
    knuckles: 'weapon',
    offhandBlade: 'weapon',
    quiver: 'weapon',
    tome: 'weapon',
    focus: 'weapon',
    plate: 'armourOffhand',
    mail: 'armourOffhand',
    leather: 'armourOffhand',
    robes: 'armourOffhand',
    shield: 'armourOffhand',
    buckler: 'armourOffhand',
  };

  it('puts weapons and damage off-hands in the offensive pool, the rest in the defensive one', () => {
    for (const gearType of Object.keys(gearProfiles) as GearType[]) {
      expect(affixSlotOf(gearType)).toBe(expected[gearType]);
    }
    expect(affixSlotOf(undefined)).toBe('any');
  });

  it('rolls the offensive pool on a quiver and the defensive one on a shield', () => {
    expect(affixPool({ itemId: 'quiver1' }).some((a) => a.id === 'hunter')).toBe(true);
    expect(ingredientAffixId('fangOrHorn', 'quiver')).toBe('hunter');
    expect(stoneAffixId('quiver', 'fire')).toBe('infusedFire');
    const shieldPool = affixPool({ itemId: 'shield1' });
    expect(shieldPool.some((a) => a.id === 'thickHide')).toBe(true);
    expect(shieldPool.some((a) => a.id === 'hunter')).toBe(false);
    expect(stoneAffixId('shield', 'fire')).toBe('wardingFire');
  });
});

describe('affix rolls', () => {
  it('rolls values inside the range on a bell curve, fixed affixes at 0', () => {
    const values = Array.from({ length: 500 }, (_, i) => affixValue(createRng(`v${i}`), affixById.hunter));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(15);
    expect(Math.max(...values)).toBeLessThanOrEqual(30);
    const middle = values.filter((v) => v >= 20 && v <= 25).length;
    expect(middle / values.length).toBeGreaterThan(0.4);
    expect(affixValue(createRng('x'), affixById.cleaving)).toBe(0);
  });

  it('never repeats an affix on one piece', () => {
    for (let i = 0; i < 50; i++) {
      const piece = { itemId: 'sword1', rarity: 'legendary' as const, affixes: [{ id: 'hunter', value: 20 }] };
      const rolled = rollAffixes(createRng(`r${i}`), piece, 3, affixPool(piece));
      const ids = [...piece.affixes, ...rolled].map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('takes the best value of a party-wide affix', () => {
    const a = makeGearPiece('a', 'sword1', 'common', undefined, { forced: [{ id: 'plunderer', value: 7 }] });
    const b = makeGearPiece('b', 'sword1', 'common', undefined, { forced: [{ id: 'plunderer', value: 12 }] });
    expect(bestAffixValue([a, b], 'plunderer')).toBe(12);
  });
});

describe('makeGearPiece', () => {
  it('gives each rarity its affix count, all fitting the slot', () => {
    for (const rarity of RARITIES) {
      const piece = makeGearPiece(`p-${rarity}`, 'mail2', rarity);
      expect(piece.affixes).toHaveLength(gearRules.affixCount[rarity]);
      for (const affix of piece.affixes) expect(slotOf(affix.id)).not.toBe('weapon');
    }
  });

  it('is the same for the same uid', () => {
    expect(makeGearPiece('same', 'bow3', 'rare')).toEqual(makeGearPiece('same', 'bow3', 'rare'));
  });

  it('gives a looted Legendary one unique that fits it, and a relic none', () => {
    for (let i = 0; i < 30; i++) {
      const piece = makeGearPiece(`L${i}`, 'shield3', 'legendary');
      expect(uniquePool(piece).map((r) => r.id)).toContain(piece.unique);
    }
    expect(makeGearPiece('relic', 'bow1', 'legendary', undefined, { relicId: 'poachersLongbow' }).unique).toBeUndefined();
    const trinket = makeGearPiece('t', trinketId('hawkEyeRing', 2), 'legendary');
    expect(uniquePool(trinket).map((r) => r.id)).toContain(trinket.unique);
  });
});
