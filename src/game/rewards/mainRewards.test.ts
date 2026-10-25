import { dungeonById } from '@/content/lookup';
import { mainRewardPool, mainRewardRules } from '@/content/mainRewards';

import { createRng } from '../generation/rng';
import { createInitialSave, type SaveData } from '../save';
import type { MainRewardKind } from '../types';
import { grantMainRewards } from './mainRewards';

const veteran = (extra: Partial<SaveData> = {}): SaveData => ({ ...createInitialSave(), firstSigilGiven: true, ...extra });

function kindsOver(dungeonId: string, runs: number, save = veteran()) {
  const counts: Record<string, number> = {};
  let withReward = 0;
  let twice = 0;
  for (let i = 0; i < runs; i++) {
    const { rewards } = grantMainRewards(save, dungeonById[dungeonId], createRng(`m${i}`), 0);
    if (rewards.length > 0) withReward++;
    if (rewards.length > 1) twice++;
    rewards.forEach((r) => (counts[r.kind] = (counts[r.kind] ?? 0) + 1));
  }
  return { counts, withReward: withReward / runs, twice: twice / runs };
}

describe('main reward chances', () => {
  it('follows each dungeon type: 30% farm, 75% mid, boss always plus 50% a second', () => {
    expect(kindsOver('ratCellar', 2000).withReward).toBeCloseTo(0.3, 1);
    expect(kindsOver('goblinWarren', 2000).withReward).toBeCloseTo(0.75, 1);
    const boss = kindsOver('ogreQuarry', 2000);
    expect(boss.withReward).toBe(1);
    expect(boss.twice).toBeCloseTo(0.5, 1);
  });

  it('picks from the pool by weight', () => {
    const { counts } = kindsOver('ogreQuarry', 3000);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const weights = mainRewardPool.reduce((sum, e) => sum + e.weight, 0);
    for (const { kind, weight } of mainRewardPool) {
      expect((counts[kind] ?? 0) / total).toBeCloseTo(weight / weights, 1);
    }
  });
});

describe('main reward contents', () => {
  const force = (kind: MainRewardKind, save = veteran()) =>
    grantMainRewards(save, dungeonById.ogreQuarry, createRng('f'), 1000, { force: kind });

  it('pays a gold pouch of 2–3× a gold roll', () => {
    const { save, rewards } = force('goldPouch');
    const pouch = rewards[0];
    if (pouch.kind !== 'goldPouch') throw new Error(pouch.kind);
    const [min, max] = dungeonById.ogreQuarry.gold;
    expect(pouch.gold).toBeGreaterThanOrEqual(min * 2);
    expect(pouch.gold).toBeLessThanOrEqual(max * 3);
    expect(save.gold).toBe(pouch.gold);
  });

  it('gives a Sigil of the dungeon tier, and a gold pouch instead at the cap', () => {
    expect(force('sigil').save.sigils).toEqual([2]);
    const full = force('sigil', veteran({ sigils: [1, 1, 1] }));
    expect(full.rewards[0].kind).toBe('goldPouch');
    expect(full.save.sigils).toEqual([1, 1, 1]);
  });

  it('adds a treasure map that expires in 48 hours, or a gold pouch at the cap', () => {
    const { save } = force('treasureMap');
    expect(save.treasureMaps).toEqual([{ id: 'map1', tier: 2, expiresAt: 1000 + 48 * 3_600_000, location: null }]);
    const maps = Array.from({ length: mainRewardRules.treasureMapCap }, (_, i) => ({ ...save.treasureMaps[0], id: `m${i}` }));
    expect(force('treasureMap', veteran({ treasureMaps: maps })).rewards[0].kind).toBe('goldPouch');
  });

  it('stocks a lure', () => {
    expect(force('lure').save.lures).toBe(1);
  });
});

describe('Sigil guarantees', () => {
  it('guarantees the first Sigil on the first tier 1 boss win', () => {
    const { save, rewards } = grantMainRewards(createInitialSave(), dungeonById.banditStockade, createRng('x'), 0);
    expect(rewards.some((r) => r.kind === 'sigil')).toBe(true);
    expect(save.firstSigilGiven).toBe(true);
  });

  it('gives a Sigil after 10 successful expeditions without one, then resets', () => {
    let save = veteran();
    for (let i = 0; i < 40; i++) {
      const before = save.sigilPity;
      const { save: next, rewards } = grantMainRewards(save, dungeonById.ratCellar, createRng(`p${i}`), 0);
      const gotSigil = rewards.some((r) => r.kind === 'sigil');
      if (before >= mainRewardRules.sigilPityAfter) expect(gotSigil).toBe(true);
      expect(next.sigilPity).toBe(gotSigil ? 0 : before + 1);
      save = { ...next, sigils: [] };
    }
  });
});
