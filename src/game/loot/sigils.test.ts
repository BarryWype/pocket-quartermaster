import { dungeons } from '@/content/dungeons';
import { lootConfig } from '@/content/loot/config';

import { shardId } from '../elements';
import { createRng } from '../generation/rng';
import { createInitialSave, type SaveData } from '../save';
import { rollSigil } from './sigils';

const short = dungeons.find((d) => d.tier === 1 && d.slot === 'short')!;
const boss = dungeons.find((d) => d.tier === 1 && d.isBoss)!;

/** A save one win away from the pity counter, whose slot roll fails. */
function pityDue(): { save: SaveData; seed: string } {
  const save: SaveData = { ...createInitialSave(), sigilPity: lootConfig.sigils.pityAfter };
  return { save, seed: 'pity' };
}

describe('rollSigil', () => {
  it('counts a failed roll towards the pity counter', () => {
    for (let i = 0; i < 40; i++) {
      const save: SaveData = { ...createInitialSave(), sigilPity: 0 };
      const { save: after, drop } = rollSigil(save, short, createRng(`s${i}`));
      if (drop.sigil) continue; // The slot's roll landed.
      expect(after.sigilPity).toBe(1);
      expect(drop.sigilShards).toBeUndefined();
    }
  });

  it('grants a Sigil once the pity counter reaches pityAfter', () => {
    const { save, seed } = pityDue();
    const { save: after, drop } = rollSigil(save, short, createRng(seed));
    expect(drop.sigil).toBe(1);
    expect(after.sigils).toEqual([1]);
    expect(after.sigilPity).toBe(0);
  });

  it('always grants a Sigil for the first tier 1 boss win', () => {
    for (let i = 0; i < 30; i++) {
      const { save: after, drop } = rollSigil(createInitialSave(), boss, createRng(`b${i}`));
      expect(drop.sigil).toBe(1);
      expect(after.sigils).toEqual([1]);
      expect(after.firstSigilGiven).toBe(true);
    }
  });

  it('crumbles into capShardsPerTier × tier shards at the cap', () => {
    const capped: SaveData = { ...createInitialSave(), sigils: [1, 1, 1], sigilPity: lootConfig.sigils.pityAfter };
    const { save: after, drop } = rollSigil(capped, boss, createRng('cap'));
    expect(drop.sigilShards!.amount).toBe(lootConfig.sigils.capShardsPerTier * boss.tier);
    expect(after.materials[shardId(drop.sigilShards!.element)]).toBe(drop.sigilShards!.amount);
    expect(after.sigils).toEqual([1, 1, 1]);
    expect(after.sigilPity).toBe(0);
  });
});
