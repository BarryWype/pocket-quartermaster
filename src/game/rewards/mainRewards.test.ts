import { dungeonById } from '@/content/lookup';
import { mainRewardPool, mainRewardRules } from '@/content/mainRewards';

import { shardId } from '../elements';
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

  it('pays a gold pouch of one gold roll', () => {
    const { save, rewards } = force('goldPouch');
    const pouch = rewards[0];
    if (pouch.kind !== 'goldPouch') throw new Error(pouch.kind);
    const [min, max] = dungeonById.ogreQuarry.gold;
    expect(mainRewardRules.goldPouchMultiplier).toBe(1);
    expect(pouch.gold).toBeGreaterThanOrEqual(min);
    expect(pouch.gold).toBeLessThanOrEqual(max);
    expect(save.gold).toBe(pouch.gold);
  });

  it('weighs gold pouches 15 in the pool', () => {
    expect(mainRewardPool.find((p) => p.kind === 'goldPouch')!.weight).toBe(15);
  });

  it('gives a Sigil of the dungeon tier, and 2 × tier shards instead at the cap', () => {
    expect(force('sigil').save.sigils).toEqual([2]);
    const full = force('sigil', veteran({ sigils: [1, 1, 1] }));
    const reward = full.rewards[0];
    if (reward.kind !== 'shards') throw new Error(reward.kind);
    expect(reward.amount).toBe(4);
    expect(full.save.materials[shardId(reward.element)]).toBe(4);
    expect(full.save.sigils).toEqual([1, 1, 1]);
    expect(full.save.gold).toBe(0);
    expect(force('sigil', veteran({ sigils: [1, 1, 1] })).rewards).toEqual(full.rewards);
  });

  it('adds a treasure map that expires in 48 hours, or half a gold roll at the cap', () => {
    const { save } = force('treasureMap');
    expect(save.treasureMaps).toEqual([{ id: 'map1', tier: 2, expiresAt: 1000 + 48 * 3_600_000, location: null }]);
    const maps = Array.from({ length: mainRewardRules.treasureMapCap }, (_, i) => ({ ...save.treasureMaps[0], id: `m${i}` }));
    const full = force('treasureMap', veteran({ treasureMaps: maps }));
    const reward = full.rewards[0];
    if (reward.kind !== 'mapGold') throw new Error(reward.kind);
    const [min, max] = dungeonById.ogreQuarry.gold;
    expect(reward.gold).toBeGreaterThanOrEqual(Math.round(min / 2));
    expect(reward.gold).toBeLessThanOrEqual(Math.round(max / 2));
    expect(full.save.gold).toBe(reward.gold);
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
