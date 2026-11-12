import { makeGearPiece } from '../gear/make';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { GearInstance } from '../types';
import { dressLootTrinkets, fillLootTrinkets } from './bot';

const PARTY = ['bram', 'lyra', 'mira'];

/** A save holding the given pieces, nothing worn. */
const holding = (...pieces: GearInstance[]): SaveData => {
  const save = createInitialSave();
  return { ...save, gear: [...save.gear, ...pieces] };
};

const trinketOf = (save: SaveData, heroId: string) =>
  save.gear.find((g) => g.uid === save.heroes.find((h) => h.id === heroId)!.equipment.trinket)?.itemId ?? null;

describe('fillLootTrinkets', () => {
  it('fills empty trinket slots with spare loot trinkets, one hero per kind', () => {
    const save = holding(
      makeGearPiece('g1', 'bountyToken', 'common'),
      makeGearPiece('g2', 'bountyToken', 'common'),
      makeGearPiece('g3', 'quillCharm', 'common'),
    );
    const filled = fillLootTrinkets(save, PARTY);
    expect(trinketOf(filled, 'bram')).toBe('bountyToken');
    // The second token's kind is already worn, so lyra takes the quill.
    expect(trinketOf(filled, 'lyra')).toBe('quillCharm');
    expect(trinketOf(filled, 'mira')).toBeNull();
  });

  it('leaves a worn combat trinket alone', () => {
    const ring = makeGearPiece('g1', 'hawkEyeRing1', 'common');
    const token = makeGearPiece('g2', 'bountyToken', 'common');
    const save = equip(holding(ring, token), 'bram', 'trinket', ring.uid);
    const filled = fillLootTrinkets(save, PARTY);
    expect(trinketOf(filled, 'bram')).toBe('hawkEyeRing1');
    expect(trinketOf(filled, 'lyra')).toBe('bountyToken');
  });
});

describe('dressLootTrinkets', () => {
  it('swaps the party hero’s combat trinket for a held spare loot trinket that applies, on a safe run', () => {
    const ring = makeGearPiece('g1', 'hawkEyeRing1', 'common');
    const token = makeGearPiece('g2', 'bountyToken', 'common');
    const save = equip(holding(ring, token), 'bram', 'trinket', ring.uid);
    expect(trinketOf(dressLootTrinkets(save, ['bram'], 'dungeonRun', true), 'bram')).toBe('bountyToken');
  });

  it('takes no loot trinket that does not apply at the source, and none another hero wears', () => {
    const ring = makeGearPiece('g1', 'hawkEyeRing1', 'common');
    const scarab = makeGearPiece('g2', 'scarabCharm', 'common');
    const save = equip(holding(ring, scarab), 'bram', 'trinket', ring.uid);
    // Treasure maps cannot drop on a patrol.
    expect(trinketOf(dressLootTrinkets(save, ['bram'], 'patrol', true), 'bram')).toBe('hawkEyeRing1');
    // The scarab applies at a dungeon run, but mira wears it: it is not a spare.
    const worn = equip(save, 'mira', 'trinket', scarab.uid);
    expect(trinketOf(dressLootTrinkets(worn, ['bram'], 'dungeonRun', true), 'bram')).toBe('hawkEyeRing1');
  });

  it('swaps a worn loot trinket back for the best spare combat trinket on a risky run', () => {
    const token = makeGearPiece('g1', 'bountyToken', 'common');
    const ring = makeGearPiece('g2', 'hawkEyeRing1', 'common');
    const save = equip(holding(token, ring), 'bram', 'trinket', token.uid);
    expect(trinketOf(dressLootTrinkets(save, ['bram'], 'dungeonRun', false), 'bram')).toBe('hawkEyeRing1');
    // With no combat trinket to trade back to, the loot trinket stays.
    const alone = equip(holding(token), 'bram', 'trinket', token.uid);
    expect(trinketOf(dressLootTrinkets(alone, ['bram'], 'dungeonRun', false), 'bram')).toBe('bountyToken');
  });
});
