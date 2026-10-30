import { guildRules, guildTrackById, type GuildTrackId } from '@/content/guild';
import { newHero, xpToNextLevel } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import { dungeons } from '@/content/dungeons';

import { expeditionMinutes, resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { migrateV8Save } from '../migrations';
import { createRng } from '../generation/rng';
import { rollSigil } from '../loot/sigils';
import { challengeSanctum, type SanctumSpawn } from '../sanctums/sanctums';
import { createInitialSave, type SaveData } from '../save';
import { tavernOffers } from '../taverns/taverns';
import { equip, rosterFull } from '../team/team';
import { buyRank, guildBonus, partySize, rankCost, rankPrice, rankProblem, rosterCap, sigilCap } from './guild';
import { applyTraining } from './training';

const HOUR = 3_600_000;
const ALL = ['bram', 'lyra', 'mira'];
const BOSSES = ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall', 'dragonLair'];
/** Total XP a hero has ever earned, from their level and XP within it. */
const totalXp = (h: { level: number; xp: number }) =>
  h.xp + Array.from({ length: h.level - 1 }, (_, i) => xpToNextLevel(i + 1)).reduce((sum, need) => sum + need, 0);

/** The Guild Hall open, with bosses beaten up to `tier` and plenty to spend. */
function hall(tier = 1, extra: Partial<SaveData> = {}): SaveData {
  return {
    ...createInitialSave(),
    tutorial: { step: 'done', woodSpot: null },
    clearedDungeons: BOSSES.slice(0, tier),
    gold: 100_000,
    charters: 5,
    materials: { stone: 100, copper: 100 },
    ...extra,
  };
}
const withRanks = (ranks: Partial<Record<GuildTrackId, number>>, base = hall()) => ({ ...base, guild: ranks });

/** A team that clears tier 1 easily. */
function strongTeam(save: SaveData): SaveData {
  let next: SaveData = {
    ...save,
    gear: ['sword5', 'bow5', 'wand5', 'mail5', 'mail5', 'mail5'].map((itemId, i) => ({ uid: `g${i}`, itemId, quality: 'legendary' })),
  };
  ALL.forEach((id, i) => {
    next = equip(equip(next, id, 'weapon', `g${i}`), id, 'armor', `g${i + 3}`);
  });
  return next;
}
const run = (save: SaveData, dungeonId = 'ratCellar', seed = 0) => {
  const started = startExpedition({ ...save, nextUid: 100 + seed }, dungeonId, ALL, 0);
  return resolveExpedition(started, started.expeditions[0]);
};

describe('costs and gates', () => {
  it('cost baseCost × 1.8^(rank − 1), rounded to clean numbers, unless a track lists its own', () => {
    expect([1, 2, 3].map((r) => rankCost(guildTrackById.heroXp, r))).toEqual([150, 270, 490]);
    expect(rankCost(guildTrackById.partySlot, 1)).toBe(3000);
    expect(rankCost({ ...guildTrackById.heroXp, baseCost: 700 }, 2)).toBe(1250);
    expect([1, 2, 3, 4].map((r) => rankCost(guildTrackById.gold, r))).toEqual(guildTrackById.gold.costs);
  });

  it('add stone at rank 3, copper at rank 4 and a charter for milestones', () => {
    expect(rankPrice(guildTrackById.gold, 3).materials).toEqual([{ materialId: 'stone', amount: 15 }]);
    expect(rankPrice(guildTrackById.gold, 4).materials).toEqual([{ materialId: 'copper', amount: 10 }]);
    expect(rankPrice(guildTrackById.rosterSlot7, 1)).toEqual({ gold: 1200, materials: [], charters: 1 });
  });

  it('opens with the taverns, and gates ranks behind tier bosses', () => {
    expect(rankProblem({ ...hall(), clearedDungeons: [] }, 'gold')).toEqual({ kind: 'hallLocked' });
    expect(rankProblem(withRanks({ gold: 1 }), 'gold')).toBeNull();
    expect(rankProblem(withRanks({ gold: 2 }), 'gold')).toEqual({ kind: 'gate', tier: 2, boss: 'Ogre Quarry' });
    expect(rankProblem(withRanks({ gold: 2 }, hall(2)), 'gold')).toBeNull();
    expect(rankProblem(hall(1), 'rosterSlot7')).toMatchObject({ kind: 'gate', tier: 2 });
    expect(rankProblem(withRanks({ gold: 4 }), 'gold')).toEqual({ kind: 'maxed' });
  });

  it('needs Roster slot 7 before Roster slot 8', () => {
    expect(rankProblem(hall(4), 'rosterSlot8')).toEqual({ kind: 'requires', track: 'rosterSlot7' });
    expect(rankProblem(withRanks({ rosterSlot7: 1 }, hall(4)), 'rosterSlot8')).toBeNull();
  });

  it('says what is missing when unaffordable', () => {
    const poor = { ...withRanks({ gold: 2 }, hall(2)), gold: 50, materials: { stone: 5 }, charters: 0 };
    expect(rankProblem(poor, 'gold')).toEqual({
      kind: 'missing',
      gold: rankCost(guildTrackById.gold, 3) - 50,
      materials: [{ materialId: 'stone', amount: 10 }],
      charters: 0,
    });
    expect(rankProblem({ ...hall(2), charters: 0 }, 'rosterSlot7')).toMatchObject({ kind: 'missing', charters: 1 });
  });
});

describe('buying', () => {
  it('spends gold, materials and charters, and raises the rank', () => {
    const save = buyRank(withRanks({ gold: 2 }, hall(2)), 'gold');
    expect(save).toMatchObject({ gold: 100_000 - rankCost(guildTrackById.gold, 3), materials: { stone: 85, copper: 100 }, guild: { gold: 3 } });
    const roster = buyRank(hall(2), 'rosterSlot7');
    expect(roster.charters).toBe(4);
  });

  it('refuses past the max rank, when locked or when unaffordable', () => {
    expect(() => buyRank(withRanks({ gold: 4 }, hall(4)), 'gold')).toThrow();
    expect(() => buyRank(hall(1), 'partySlot')).toThrow();
    expect(() => buyRank({ ...hall(), gold: 0 }, 'gold')).toThrow();
  });
});

describe('effects', () => {
  it('Hero XP multiplies expedition XP', () => {
    const plain = run(strongTeam(hall()));
    const trained = run(strongTeam(withRanks({ heroXp: 2 })));
    const bram = (s: SaveData) => s.heroes.find((h) => h.id === 'bram')!;
    expect(totalXp(bram(trained.save))).toBe(Math.round(plain.report.xp * 1.2));
  });

  it('Faster expeditions shortens new runs only, in whole seconds, but not the tutorial run', () => {
    const save = withRanks({ fasterExpeditions: 3 });
    expect(expeditionMinutes(save, dungeonById.ratCellar)).toBeCloseTo(5 * 0.7);
    const started = startExpedition(save, 'goblinWarren', ['bram'], 1234);
    expect(started.expeditions[0].endsAt - 1234).toBe(Math.round(15 * 60 * 0.7) * 1000);
    // Buying more later doesn't touch an expedition already under way.
    expect(withRanks({ fasterExpeditions: 3 }, { ...started, guild: {} }).expeditions[0]).toEqual(started.expeditions[0]);
    const tutorial = { ...save, tutorial: { step: 'sendExpedition' as const, woodSpot: null } };
    expect(expeditionMinutes(tutorial, dungeonById.ratCellar) * 60).toBe(5);
  });

  it('Gold multiplies all dungeon gold: the run, its rolls and the bonus rows', () => {
    const reports = (save: SaveData) => Array.from({ length: 30 }, (_, i) => run(save, 'banditStockade', i).report);
    const plain = reports(strongTeam(hall()));
    const rich = reports(strongTeam(withRanks({ gold: 4 })));
    plain.forEach((r, i) => expect(Math.abs(rich[i].gold - r.gold * 1.4)).toBeLessThanOrEqual(2));
  });

  it('Better retreats raises failed runs, never above a full clear', () => {
    const weak = { ...hall(), heroes: hall().heroes.map((h) => ({ ...h })) };
    const retreats = (save: SaveData) =>
      Array.from({ length: 40 }, (_, i) => run(save, 'goblinWarren', i).report).filter((r) => !r.success && r.encountersCleared > 0);
    const plain = retreats(weak);
    const better = retreats(withRanks({ betterRetreats: 3 }, weak));
    expect(plain.length).toBeGreaterThan(0);
    expect(better.reduce((s, r) => s + r.xp, 0)).toBeGreaterThan(plain.reduce((s, r) => s + r.xp, 0));
    for (const report of better) expect(report.xp).toBeLessThanOrEqual(dungeonById.goblinWarren.xp);
  });

  it('Gold raises the dungeon gold roll', () => {
    const plain = run(strongTeam(hall()));
    const rich = run(strongTeam(withRanks({ gold: 4 })));
    expect(rich.report.gold).toBeGreaterThan(plain.report.gold);
  });

  it('Shards adds shards to Sanctum wins only', () => {
    const spawn: SanctumSpawn = { id: 'sanctum:emberForge:t:1:0', sanctumId: 'emberForge', position: { latitude: 0, longitude: 0 }, expiresAt: 1e15 };
    const fight = (save: SaveData) => challengeSanctum({ ...save, sigils: [1] }, spawn, 1, ALL, spawn.position, 0);
    const win = fight(strongTeam(withRanks({ shards: 2 })));
    expect(win.result.win).toBe(true);
    expect(win.result.reward.shards).toBe(3 + 2);
    const loss = fight(withRanks({ shards: 2 }, { ...hall(), heroes: [newHero('x', 'X', 'troubadour', 'loud')] }));
    expect(loss.result.reward.shards).toBe(1);
  });

  it('Sigil cap, party size and roster cap add to their base values', () => {
    expect(sigilCap(hall())).toBe(lootConfig.sigils.cap);
    expect(sigilCap(withRanks({ sigilCap: 1 }))).toBe(lootConfig.sigils.cap + 1);
    expect(partySize(withRanks({ partySlot: 1 }))).toBe(4);
    expect(rosterCap(withRanks({ rosterSlot7: 1, rosterSlot8: 1 }))).toBe(8);
    const six = { ...hall(), heroes: Array.from({ length: 6 }, (_, i) => newHero(`h${i}`, 'X', 'warrior', 'tough')) };
    expect(rosterFull(six)).toBe(true);
    expect(rosterFull(withRanks({ rosterSlot7: 1 }, six))).toBe(false);
    const four = { ...withRanks({ partySlot: 1 }), heroes: [...hall().heroes, newHero('h9', 'Nim', 'thief', 'lucky')] };
    expect(startExpedition(four, 'ratCellar', [...ALL, 'h9'], 0).expeditions[0].heroIds).toHaveLength(4);
  });

  it('shards replace a Sigil only at the raised cap', () => {
    const boss = dungeons.find((d) => d.tier === 1 && d.isBoss)!;
    const full = { ...hall(), sigils: [1, 1, 1], sigilPity: lootConfig.sigils.pityAfter };
    const drop = (save: SaveData) => rollSigil(save, boss, createRng('s')).drop;
    expect(drop(full).sigilShards).toBeDefined();
    expect(drop(withRanks({ sigilCap: 1 }, full)).sigil).toBe(1);
  });

  it('Tavern discount cuts prices; the extra offer leaves the first three unchanged', () => {
    const now = Date.UTC(2026, 9, 26, 12);
    const base = tavernOffers(hall(), 'tavern:t:0', now);
    const discounted = tavernOffers(withRanks({ tavernDiscount: 3 }), 'tavern:t:0', now);
    discounted.forEach((o, i) => expect(o.price).toBe(Math.round(base[i].price * 0.7)));
    const four = tavernOffers(withRanks({ tavernOffer: 1 }), 'tavern:t:0', now);
    expect(four).toHaveLength(4);
    expect(four.slice(0, 3)).toEqual(base);
  });
});

describe('training', () => {
  const trained = withRanks({ training: 3 }, { ...hall(), trainedAt: 0 });

  it('gives heroes at home XP per hour, capped per gap, with fractions carried over', () => {
    const after = applyTraining(trained, 2 * HOUR + HOUR / 2);
    expect(after.heroes.every((h) => h.xp === 15)).toBe(true);
    expect(after.trainedAt).toBe(2 * HOUR + HOUR / 2);
    const long = applyTraining(trained, 100 * HOUR);
    expect(totalXp(long.heroes[0])).toBe(6 * guildRules.trainingMaxHours);
    const short = applyTraining(trained, HOUR / 12);
    expect(short).toEqual(trained);
    expect(applyTraining(short, HOUR / 6).heroes[0].xp).toBe(1);
  });

  it('skips heroes on an expedition, the tutorial, and a hall without training', () => {
    const away = startExpedition(trained, 'ratCellar', ['bram'], 0);
    const after = applyTraining(away, 2 * HOUR);
    expect(after.heroes.find((h) => h.id === 'bram')!.xp).toBe(0);
    expect(after.heroes.find((h) => h.id === 'lyra')!.xp).toBe(12);
    expect(applyTraining({ ...trained, tutorial: { step: 'awaitReport', woodSpot: null } }, 2 * HOUR).heroes[0].xp).toBe(0);
    expect(applyTraining({ ...trained, guild: {} }, 2 * HOUR).trainedAt).toBe(2 * HOUR);
    expect(guildBonus(trained, 'training')).toBe(6);
  });
});

describe('charters', () => {
  it('come with the first win against each tier boss, once', () => {
    const save = strongTeam({ ...hall(0), charters: 0, tutorial: { step: 'done', woodSpot: null } });
    const first = run(save, 'banditStockade');
    expect(first.report.success).toBe(true);
    expect(first.save.charters).toBe(1);
    expect(first.report.charter).toBe(true);
    expect(run(first.save, 'banditStockade').save.charters).toBe(1);
  });

  it('sometimes come with a Sanctum win', () => {
    const wins = Array.from({ length: 200 }, (_, i) => {
      const spawn: SanctumSpawn = { id: `sanctum:emberForge:c:${i}:0`, sanctumId: 'emberForge', position: { latitude: 0, longitude: 0 }, expiresAt: 1e15 };
      return challengeSanctum(strongTeam({ ...hall(), sigils: [1], charters: 0 }), spawn, 1, ALL, spawn.position, 0);
    });
    const rate = wins.filter((w) => w.save.charters === 1).length / wins.length;
    expect(rate).toBeGreaterThan(0.04);
    expect(rate).toBeLessThan(0.18);
  });

  it('are given for bosses beaten before the update', () => {
    const old = { ...createInitialSave(), clearedDungeons: ['ratCellar', 'banditStockade', 'ogreQuarry'] } as Partial<SaveData>;
    expect(migrateV8Save(old)).toMatchObject({ charters: 2, guild: {}, trainedAt: null });
  });
});
