import { affixById } from '@/content/affixes';
import { gearId, gearProfiles } from '@/content/equipment';
import { trinketId, trinketKinds } from '@/content/trinkets';

import { stoneAffixId } from '../crafting/infusion';
import { ELEMENTS } from '../elements';
import type { GearType } from '../types';
import { affixPool, affixSlotOf } from './affixes';

const gearTypes = Object.keys(gearProfiles) as GearType[];

/** Distinct affixes a piece rolls from monster parts and loot. */
const rollableCount = (itemId: string): number =>
  affixPool({ itemId }).filter((affix) => affix.source.kind === 'part' || affix.source.kind === 'loot').length;

/** Pieces allowed fewer than 8 rollable affixes, each with its reason. */
const POOL_EXCEPTIONS: Record<string, string> = {
  trinket: 'Trinkets roll only the walking affixes for now; more trinket affixes are a separate design change',
};

describe('affix coverage', () => {
  it('gives every gear type and trinket at least 8 rollable affixes, exceptions at least 1', () => {
    const pieces = [
      ...gearTypes.map((gearType) => ({ name: gearType, itemId: gearId(gearType, 1), exception: POOL_EXCEPTIONS[gearType] })),
      ...trinketKinds.map((kind) => ({
        name: kind.kind,
        itemId: kind.group === 'loot' ? kind.kind : trinketId(kind.kind, 1),
        exception: POOL_EXCEPTIONS.trinket,
      })),
    ];
    const table = pieces.map((piece) => ({ type: piece.name, rollable: rollableCount(piece.itemId) }));
    console.table(table);
    for (const [i, piece] of pieces.entries()) {
      expect([piece.name, table[i].rollable >= (piece.exception ? 1 : 8)]).toEqual([piece.name, true]);
    }
  });

  it('offers every gear type but helmets an Infused or Warding affix per element', () => {
    for (const gearType of gearTypes.filter((type) => gearProfiles[type].slot !== 'helmet')) {
      for (const element of ELEMENTS) expect(affixById[stoneAffixId(gearType, element)]).toBeDefined();
    }
  });

  it('rolls the offensive pool and Infused stones on the new weapon types', () => {
    for (const gearType of ['crossbow', 'throwing', 'totem', 'runestone', 'flasks'] as GearType[]) {
      expect(affixSlotOf(gearType)).toBe('weapon');
      expect(stoneAffixId(gearType, 'fire')).toBe('infusedFire');
    }
  });

  it('rolls only the helmet affixes on helmets: no walking affixes, no stones', () => {
    for (const gearType of gearTypes.filter((type) => gearProfiles[type].slot === 'helmet')) {
      const pool = affixPool({ itemId: gearId(gearType, 1) });
      expect(pool).toHaveLength(12);
      expect(pool.every((affix) => affix.slot === 'helmet' && affix.source.kind === 'part')).toBe(true);
    }
  });
});
