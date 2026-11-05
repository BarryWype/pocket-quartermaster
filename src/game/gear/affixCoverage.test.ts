import { affixes, affixById } from '@/content/affixes';
import { gearId, gearProfiles } from '@/content/equipment';
import { trinketId, trinketKinds } from '@/content/trinkets';

import { stoneAffixId } from '../crafting/infusion';
import { ELEMENTS } from '../elements';
import type { GearType, Keyword } from '../types';
import { affixPool, affixSlotOf } from './affixes';

const gearTypes = Object.keys(gearProfiles) as GearType[];

/** Distinct affixes a piece rolls from monster parts and loot, the per-threat ones counted once. */
const rollableCount = (itemId: string): number => {
  const keys = new Set(
    affixPool({ itemId })
      .filter((affix) => affix.source.kind === 'part' || affix.source.kind === 'loot')
      .map((affix) => (affix.family === 'threat' ? 'threat' : affix.id)),
  );
  return keys.size;
};

/** Pieces allowed fewer than 8 rollable affixes, each with its reason. */
const POOL_EXCEPTIONS: Record<string, string> = {
  trinket: 'Trinkets roll only the walking affixes for now; more trinket affixes are a separate design change',
};

describe('affix coverage', () => {
  it('gives every gear type and trinket at least 8 rollable affixes, exceptions at least 1', () => {
    const pieces = [
      ...gearTypes.map((gearType) => ({ name: gearType, itemId: gearId(gearType, 1), exception: POOL_EXCEPTIONS[gearType] })),
      ...trinketKinds.map((kind) => ({ name: kind.kind, itemId: trinketId(kind.kind, 1), exception: POOL_EXCEPTIONS.trinket })),
    ];
    const table = pieces.map((piece) => ({ type: piece.name, rollable: rollableCount(piece.itemId) }));
    console.table(table);
    for (const [i, piece] of pieces.entries()) {
      expect([piece.name, table[i].rollable >= (piece.exception ? 1 : 8)]).toEqual([piece.name, true]);
    }
  });

  it('offers every gear type an Infused or Warding affix per element', () => {
    for (const gearType of gearTypes) {
      for (const element of ELEMENTS) expect(affixById[stoneAffixId(gearType, element)]).toBeDefined();
    }
  });

  it('rolls the offensive pool and Infused stones on the new weapon types', () => {
    for (const gearType of ['crossbow', 'throwing', 'totem', 'runestone', 'flasks'] as GearType[]) {
      expect(affixSlotOf(gearType)).toBe('weapon');
      expect(stoneAffixId(gearType, 'fire')).toBe('infusedFire');
    }
  });

  it('names only existing gear types in keyword affix type lists', () => {
    for (const affix of affixes) {
      if (affix.family === 'keyword' && typeof affix.slot === 'object') {
        for (const gearType of affix.slot.types) expect(gearProfiles[gearType]).toBeDefined();
      }
    }
  });

  it('covers every natural keyword with a keyword affix on each type that has it', () => {
    // Each entry needs a reason.
    const exceptions: Partial<Record<Keyword, Partial<Record<GearType, string>>>> = {};
    const keywords: Keyword[] = ['pierce', 'cleave', 'reach', 'stagger', 'guard', 'parry', 'brace', 'channel', 'inspire'];
    const keywordAffixes = affixes.filter(
      (affix) => affix.effect.kind === 'keyword' && typeof affix.slot === 'object',
    );
    for (const keyword of keywords) {
      for (const gearType of gearTypes) {
        if (!gearProfiles[gearType].keywords.includes(keyword)) continue;
        if (exceptions[keyword]?.[gearType]) continue;
        expect(
          keywordAffixes.some(
            (affix) =>
              affix.effect.kind === 'keyword' &&
              affix.effect.keyword === keyword &&
              typeof affix.slot === 'object' &&
              affix.slot.types.includes(gearType),
          ),
        ).toBe(true);
      }
    }
  });
});
