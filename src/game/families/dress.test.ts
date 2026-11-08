import { gearProfiles } from '@/content/equipment';
import type { FamilyId } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { itemById } from '@/content/lookup';

import { pieceDamageStat } from '../equipment/damageStat';
import type { SaveData } from '../save';
import { referenceSave } from '../sim/reference';
import { uncovered } from '../threats/suggest';
import type { Briefing, GearDef } from '../types';
import { dressParty, focusFamily, sparePieces } from './dress';
import { familyLevel, partyFamilies } from './families';

const NONE: Briefing = { threats: [], restriction: null, opportunity: null };
const ARMOURED: Briefing = { threats: [{ id: 'armoured', level: 3 }], restriction: null, opportunity: null };

/** The tier 2 reference trio at the tier's end, with a spare piece of every type. */
const base = (): SaveData => referenceSave(2, 'end', 3);
const ids = (save: SaveData) => save.heroes.map((h) => h.id);
const level = (save: SaveData, family: FamilyId) => familyLevel(partyFamilies(save, ids(save))[family] ?? 0);
const worn = (save: SaveData, heroId: string, slot: 'weapon' | 'armor' | 'offhand') => {
  const uid = save.heroes.find((h) => h.id === heroId)!.equipment[slot];
  return uid ? (itemById[save.gear.find((g) => g.uid === uid)!.itemId] as GearDef) : null;
};

describe('family rules', () => {
  it('swaps spare pieces in until the party brings the tags the threat needs', () => {
    const save = base();
    expect(uncovered(save, ids(save), ARMOURED)).toBeGreaterThan(0);
    const dressed = dressParty(save, ids(save), ARMOURED);
    expect(uncovered(dressed, ids(dressed), ARMOURED)).toBe(0);
    expect(partyFamilies(dressed, ids(dressed)).breaker).toBeGreaterThanOrEqual(3);
  });

  it('then pushes the leading playstyle family to its next level', () => {
    const save = base();
    const focus = focusFamily(save, ids(save))!;
    const before = level(save, focus);
    const dressed = dressParty(save, ids(save), NONE);
    expect(level(dressed, focus)).toBeGreaterThan(before);
  });

  it('never loses a threat answer for the playstyle family', () => {
    const save = base();
    const threatsOnly = dressParty(save, ids(save), ARMOURED, null, false);
    const dressed = dressParty(save, ids(save), ARMOURED);
    expect(uncovered(dressed, ids(dressed), ARMOURED)).toBe(uncovered(threatsOnly, ids(threatsOnly), ARMOURED));
  });

  it('only gives a hero weapons and off-hands that roll with their damage stat', () => {
    const save = base();
    const dressed = dressParty(save, ids(save), ARMOURED);
    for (const hero of dressed.heroes) {
      const stat = heroClasses[hero.classId].damageStat;
      const weapon = worn(dressed, hero.id, 'weapon');
      const offhand = worn(dressed, hero.id, 'offhand');
      if (weapon) expect(pieceDamageStat(weapon, hero.classId)).toBe(stat);
      const offhandStat = offhand?.gearType ? gearProfiles[offhand.gearType].damageStat : undefined;
      if (offhandStat) expect(offhandStat).toBe(stat);
    }
  });

  it('changes nothing without spare pieces', () => {
    const save = base();
    const bare = { ...save, gear: save.gear.filter((g) => !sparePieces(save).includes(g)) };
    expect(dressParty(bare, ids(bare), ARMOURED)).toBe(bare);
  });
});
