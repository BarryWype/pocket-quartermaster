import { dungeons } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';

import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import {
  expeditionMinutes,
  fastForward,
  isDungeonAvailable,
  isDungeonUnlocked,
  resolveDue,
  resolveExpedition,
  startExpedition,
} from './expeditions';
import { estimateOdds, oddsBand } from './odds';

const ALL = ['bram', 'lyra', 'mira'];
const MIN = 60_000;
const BOSSES = dungeons.filter((d) => d.isBoss).map((d) => d.id);

/** Every tier revealed, so any dungeon can be started. */
const allTiers = (save: SaveData): SaveData => ({ ...save, clearedDungeons: BOSSES });

function geared(): SaveData {
  let save: SaveData = allTiers({
    ...createInitialSave(),
    gear: [
      { uid: 'g1', itemId: 'woodSword', durability: 15 },
      { uid: 'g2', itemId: 'woodBow', durability: 15 },
      { uid: 'g3', itemId: 'woodWand', durability: 15 },
      { uid: 'g4', itemId: 'woodArmour', durability: 15 },
    ],
    consumables: { healingPotion: 1, fireResistanceElixir: 1 },
    nextUid: 10,
  });
  save = equip(save, 'bram', 'weapon', 'g1');
  save = equip(save, 'lyra', 'weapon', 'g2');
  save = equip(save, 'mira', 'weapon', 'g3');
  save = equip(save, 'bram', 'armor', 'g4');
  return equip(save, 'bram', 'consumable', 'healingPotion');
}

/** Runs the same expedition with many seeds; resolution is deterministic per seed. */
function outcomes(save: SaveData, dungeonId: string, runs = 200) {
  return Array.from({ length: runs }, (_, i) => {
    const started = startExpedition({ ...save, nextUid: i }, dungeonId, ALL, 0);
    return resolveExpedition(started, started.expeditions[0]);
  });
}

describe('dungeon tiers', () => {
  it('has five tiers of three, each ending with one boss', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const inTier = dungeons.filter((d) => d.tier === tier);
      expect(inTier).toHaveLength(3);
      expect(inTier.filter((d) => d.isBoss)).toEqual([inTier[2]]);
      expect(inTier[0].encounterCount[0]).toBeLessThan(inTier[1].encounterCount[0]);
      expect(inTier[1].encounterCount[0]).toBeLessThan(inTier[2].encounterCount[0]);
      expect(inTier[2].boss.hp).toBeGreaterThan(inTier[1].boss.hp);
    }
  });

  it('opens only tier 1 at the start', () => {
    const fresh = createInitialSave();
    expect(dungeons.filter((d) => isDungeonUnlocked(fresh, d)).map((d) => d.tier)).toEqual([1, 1, 1]);
    expect(() => startExpedition(fresh, 'wolfDen', ['bram'], 0)).toThrow();
  });

  it('opens the next tier once its boss has been beaten', () => {
    const save = { ...createInitialSave(), clearedDungeons: ['banditStockade'] };
    expect(isDungeonUnlocked(save, dungeonById.wolfDen)).toBe(true);
    expect(isDungeonUnlocked(save, dungeonById.hauntedMine)).toBe(false);
  });

  it('has each boss drop the pickaxe that opens the next tier material', () => {
    const pickaxes = ['woodPickaxe', 'stonePickaxe', 'copperPickaxe', 'ironPickaxe', 'steelPickaxe'];
    dungeons
      .filter((d) => d.isBoss)
      .forEach((boss, i) => expect(boss.recipeDrops[0]).toEqual({ recipeId: pickaxes[i], chance: 1 }));
  });
});

describe('startExpedition', () => {
  it('creates a timed expedition with the dungeon duration', () => {
    const save = startExpedition(allTiers(createInitialSave()), 'trollBridge', ['bram'], 1000);
    expect(save.expeditions[0]).toMatchObject({ dungeonId: 'trollBridge', heroIds: ['bram'], endsAt: 1000 + 30 * MIN });
  });

  it('scales duration in debug mode', () => {
    const save = startExpedition(allTiers(createInitialSave()), 'trollBridge', ['bram'], 0, 1 / 60);
    expect(save.expeditions[0].endsAt).toBe(30_000);
  });

  it('rejects busy heroes and empty parties', () => {
    const save = startExpedition(createInitialSave(), 'goblinWarren', ['bram'], 0);
    expect(() => startExpedition(save, 'goblinWarren', ['bram', 'lyra'], 0)).toThrow();
    expect(() => startExpedition(save, 'goblinWarren', [], 0)).toThrow();
  });
});

describe('estimateOdds', () => {
  it('returns probabilities between 0 and 1', () => {
    const odds = estimateOdds(geared(), ALL, dungeonById.goblinWarren, 50);
    for (const value of [odds.success, odds.flawless, odds.progress]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(odds.flawless).toBeLessThanOrEqual(odds.success);
  });

  it('rises with better gear and is zero without a party', () => {
    const naked = estimateOdds(createInitialSave(), ALL, dungeonById.goblinWarren, 100);
    const armed = estimateOdds(geared(), ALL, dungeonById.goblinWarren, 100);
    expect(armed.success).toBeGreaterThan(naked.success);
    expect(estimateOdds(geared(), [], dungeonById.goblinWarren).success).toBe(0);
  });

  it('labels the odds', () => {
    expect(oddsBand(0.2)).toBe('Risky');
    expect(oddsBand(0.6)).toBe('Fair');
    expect(oddsBand(0.9)).toBe('Safe');
  });
});

describe('resolveExpedition', () => {
  it('gives the same result and log for the same expedition', () => {
    const save = startExpedition(geared(), 'goblinWarren', ALL, 0);
    const a = resolveExpedition(save, save.expeditions[0]);
    expect(resolveExpedition(save, save.expeditions[0])).toEqual(a);
    expect(a.report.log.length).toBeGreaterThan(0);
  });

  it('pays in full for the boss and the cleared share on a retreat', () => {
    const dungeon = dungeonById.banditStockade;
    const results = outcomes(geared(), dungeon.id);
    const wins = results.filter((r) => r.report.success);
    const retreats = results.filter((r) => r.report.outcome === 'retreat');
    expect(wins.length).toBeGreaterThan(0);
    expect(retreats.length).toBeGreaterThan(0);
    wins.forEach(({ report }) => expect(report.xp).toBe(dungeon.xp));
    retreats.forEach(({ report }) => {
      const share = report.encountersCleared / report.encounterCount;
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThan(1);
      expect(report.xp).toBe(Math.round(dungeon.xp * share));
      expect(report.recipeId).toBeNull();
    });
  });

  it('reports the outcome tier and how the heroes came back', () => {
    for (const { report } of outcomes(geared(), 'goblinWarren', 50)) {
      expect(['flawless', 'success', 'retreat', 'defeat']).toContain(report.outcome);
      expect(report.success).toBe(report.outcome === 'flawless' || report.outcome === 'success');
      expect(report.heroHp.map((h) => h.heroId)).toEqual(ALL);
      report.heroHp.forEach(({ hp, maxHp }) => expect(hp).toBeLessThanOrEqual(maxHp));
    }
  });

  it('records the dungeon as cleared only on success', () => {
    const results = outcomes({ ...geared(), clearedDungeons: [] }, 'banditStockade', 50);
    results.forEach(({ save, report }) =>
      expect(save.clearedDungeons.includes('banditStockade')).toBe(report.success),
    );
  });

  it('always hands over the next pickaxe when a boss falls for the first time', () => {
    const wins = outcomes(geared(), 'banditStockade').filter((r) => r.report.success);
    wins.forEach(({ save, report }) => {
      expect(report.recipeId).toBe('woodPickaxe');
      expect(save.knownRecipes).toContain('woodPickaxe');
    });
  });

  it('applies rewards, XP and wear to the save', () => {
    const started = startExpedition(geared(), 'goblinWarren', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(save.expeditions).toEqual([]);
    expect(save.reports[0]).toEqual(report);
    expect(save.gold).toBe(report.gold);
    save.heroes.forEach((hero) => expect(hero.xp + (hero.level - 1) * 100).toBe(report.xp));
    expect(save.gear.find((g) => g.uid === 'g1')!.durability).toBeLessThan(15);
  });

  it('returns potions nobody needed and uses up the ones drunk', () => {
    const results = outcomes(geared(), 'banditStockade', 100);
    const drunk = results.filter((r) => r.report.consumablesUsed.includes('healingPotion'));
    const spared = results.filter((r) => !r.report.consumablesUsed.includes('healingPotion'));
    expect(drunk.length).toBeGreaterThan(0);
    expect(spared.length).toBeGreaterThan(0);
    drunk.forEach(({ save }) => expect(save.consumables.healingPotion ?? 0).toBe(0));
    spared.forEach(({ save }) => expect(save.consumables.healingPotion).toBe(1));
    results.forEach(({ save }) => expect(save.heroes.find((h) => h.id === 'bram')!.equipment.consumable).toBeNull());
  });

  it('always uses up elixirs', () => {
    const save = equip(geared(), 'lyra', 'consumable', 'fireResistanceElixir');
    const started = startExpedition(save, 'cinderHollow', ALL, 0);
    expect(resolveExpedition(started, started.expeditions[0]).report.consumablesUsed).toContain('fireResistanceElixir');
  });

  it('breaks worn-out gear and unequips it', () => {
    const worn = { ...geared(), gear: geared().gear.map((g) => (g.uid === 'g1' ? { ...g, durability: 1 } : g)) };
    const started = startExpedition(worn, 'goblinWarren', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.brokenGear).toContain('woodSword');
    expect(save.gear.some((g) => g.uid === 'g1')).toBe(false);
    expect(save.heroes.find((h) => h.id === 'bram')!.equipment.weapon).toBeNull();
  });

  it('drops the tier gear recipes in tier 1 dungeons', () => {
    const taught = new Set(
      ['ratCellar', 'goblinWarren'].flatMap((id) => outcomes(geared(), id, 300).map((r) => r.report.recipeId)),
    );
    expect(taught).toEqual(new Set([null, 'woodArmour', 'woodWand', 'woodBow']));
  });

  it('writes one line per encounter plus a summary, naming the heroes', () => {
    for (const dungeon of dungeons) {
      for (const { report } of outcomes(geared(), dungeon.id, 20)) {
        // Every encounter played gets a line: all cleared ones, plus the one the team fell in.
        const played = report.encountersCleared + (report.success ? 0 : 1);
        const extras = (report.recipeId ? 1 : 0) + report.brokenGear.length;
        expect(report.log.length).toBeGreaterThanOrEqual(played + 1 + extras);
        expect(report.log.length).toBeLessThanOrEqual(played + 1 + extras + 4);
        expect(report.log.join(' ')).not.toMatch(/\{\w+\}/);
      }
    }
    const won = outcomes(geared(), 'ratCellar', 20).find((r) => r.report.success)!;
    expect(won.report.log.join(' ')).toMatch(/Bram|Lyra|Mira/);
  });
});

describe('main rewards', () => {
  it('only rolls on a successful expedition', () => {
    for (const { report } of outcomes(geared(), 'banditStockade', 60)) {
      if (!report.success) expect(report.mainRewards).toEqual([]);
      else expect(report.mainRewards.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('can be forced from debug, and shows in the log', () => {
    const wins = Array.from({ length: 20 }, (_, i) => {
      const run = startExpedition({ ...geared(), nextUid: i }, 'ratCellar', ALL, 0);
      return resolveExpedition(run, run.expeditions[0], { mainReward: { force: 'lure' } });
    }).filter((r) => r.report.success);
    expect(wins.length).toBeGreaterThan(0);
    wins.forEach(({ save, report }) => {
      expect(report.mainRewards).toEqual([{ kind: 'lure' }]);
      expect(save.lures).toBe(1);
      expect(report.log.join(' ')).toMatch(/lure/);
    });
  });
});

describe('tutorial expedition', () => {
  /** Fresh from the tutorial: only Bram's wooden sword, about to send the first expedition. */
  const tutorialSave = (): SaveData => {
    const save: SaveData = {
      ...createInitialSave(),
      gear: [{ uid: 'g1', itemId: 'woodSword', durability: 15 }],
      tutorial: { step: 'sendExpedition', woodSpot: null },
    };
    return equip(save, 'bram', 'weapon', 'g1');
  };

  it('only allows the Rat Cellar', () => {
    const save = tutorialSave();
    expect(dungeons.filter((d) => isDungeonAvailable(save, d)).map((d) => d.id)).toEqual(['ratCellar']);
    expect(() => startExpedition(save, 'goblinWarren', ALL, 0)).toThrow();
  });

  it('takes 5 seconds and always succeeds, even when the odds say otherwise', () => {
    const save = tutorialSave();
    expect(expeditionMinutes(save, dungeonById.ratCellar) * MIN).toBe(5000);
    expect(estimateOdds(save, ['bram'], dungeonById.ratCellar, 100).success).toBeLessThan(1);
    const started = startExpedition(save, 'ratCellar', ['bram'], 0);
    expect(started.expeditions[0]).toMatchObject({ endsAt: 5000, guaranteed: true });
    for (let i = 0; i < 30; i++) {
      const run = startExpedition({ ...save, nextUid: i }, 'ratCellar', ['bram'], 0);
      expect(resolveExpedition(run, run.expeditions[0]).report.success).toBe(true);
    }
  });

  it('pays a little gold, the wooden bow blueprint and a mysterious key', () => {
    const started = startExpedition(tutorialSave(), 'ratCellar', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.gold).toBe(10);
    expect(report.recipeId).toBe('woodBow');
    expect(report.materials).toEqual([{ materialId: 'mysteriousKey', amount: 1 }]);
    expect(save.knownRecipes).toContain('woodBow');
    expect(save.materials.mysteriousKey).toBe(1);
    expect(report.log.join(' ')).toMatch(/mysterious key/);
  });

  it('only applies to the first expedition', () => {
    expect(expeditionMinutes(createInitialSave(), dungeonById.banditStockade)).toBe(30);
    expect(startExpedition(createInitialSave(), 'ratCellar', ALL, 0).expeditions[0].guaranteed).toBe(false);
  });
});

describe('resolveDue', () => {
  it('resolves only finished expeditions, even after the app was closed', () => {
    let save = startExpedition(allTiers(createInitialSave()), 'goblinWarren', ['bram'], 0);
    save = startExpedition(save, 'cinderHollow', ['lyra'], 0);
    const later = resolveDue(save, 20 * MIN);
    expect(later.reports.map((r) => r.dungeonId)).toEqual(['goblinWarren']);
    expect(later.save.expeditions.map((e) => e.dungeonId)).toEqual(['cinderHollow']);
  });

  it('fast-forwards running expeditions', () => {
    const save = startExpedition(allTiers(createInitialSave()), 'cinderHollow', ['lyra'], 0);
    expect(resolveDue(fastForward(save, 5), 5).reports).toHaveLength(1);
  });
});
