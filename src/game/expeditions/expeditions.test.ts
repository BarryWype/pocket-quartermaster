import { dungeons } from '@/content/dungeons';
import { xpRules } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';
import { mainRewardRules } from '@/content/mainRewards';

import { createInitialSave, type SaveData } from '../save';
import { healAll } from '../team/health';
import { equip } from '../team/team';
import {
  bossBonusAvailable,
  expeditionMinutes,
  fastForward,
  isDungeonAvailable,
  isDungeonUnlocked,
  readyExpeditions,
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
      { uid: 'g1', itemId: 'woodSword', quality: 'normal' },
      { uid: 'g2', itemId: 'woodBow', quality: 'normal' },
      { uid: 'g3', itemId: 'woodWand', quality: 'normal' },
      { uid: 'g4', itemId: 'woodArmour', quality: 'normal' },
    ],
    consumables: { ...createInitialSave().consumables, healingPotion: 1, emberWardSalve: 1 },
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
  it('has five tiers, each with one boss and three short and three long dungeons', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const inTier = dungeons.filter((d) => d.tier === tier);
      const [boss] = inTier.filter((d) => d.isBoss);
      const short = inTier.filter((d) => d.slot === 'short');
      const long = inTier.filter((d) => d.slot === 'long');
      expect(inTier.filter((d) => d.isBoss)).toHaveLength(1);
      expect([short.length, long.length]).toEqual([3, 3]);
      for (const s of short) for (const l of long) expect(s.encounterCount[0]).toBeLessThan(l.encounterCount[0]);
      for (const l of long) {
        expect(l.encounterCount[0]).toBeLessThan(boss.encounterCount[0]);
        expect(boss.boss.hp).toBeGreaterThan(l.boss.hp);
      }
    }
  });

  it('opens only tier 1 at the start', () => {
    const fresh = createInitialSave();
    expect(new Set(dungeons.filter((d) => isDungeonUnlocked(fresh, d)).map((d) => d.tier))).toEqual(new Set([1]));
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

  it('stands the escort down when its hero is sent', () => {
    const save = { ...createInitialSave(), escort: { heroId: 'bram' } };
    expect(startExpedition(save, 'goblinWarren', ['bram'], 0).escort).toBeNull();
    expect(startExpedition(save, 'goblinWarren', ['lyra'], 0).escort).toEqual({ heroId: 'bram' });
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
    // Tier 1 is still the highest, so its XP isn't reduced.
    const results = outcomes({ ...geared(), clearedDungeons: [] }, dungeon.id);
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

  it('applies rewards and XP to the save, and never wears gear down', () => {
    const started = startExpedition(geared(), 'goblinWarren', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(save.expeditions).toEqual([]);
    expect(save.reports[0]).toEqual(report);
    expect(save.gold).toBe(report.gold + (report.firstClear?.gold ?? 0));
    // Mira is a quick learner: +20% XP.
    save.heroes.forEach((hero) =>
      expect(hero.xp + (hero.level - 1) * 100).toBe(
        Math.round((report.xp + (report.firstClear?.xp ?? 0)) * (hero.trait === 'quickLearner' ? 1.2 : 1)),
      ),
    );
    expect(save.gear).toEqual(started.gear);
  });

  it('uses up every equipped consumable, salvaging the ones that never triggered', () => {
    const results = outcomes(geared(), 'banditStockade', 100);
    const drunk = results.filter((r) => !r.report.salvaged.some((s) => s.itemId === 'healingPotion'));
    const spared = results.filter((r) => r.report.salvaged.some((s) => s.itemId === 'healingPotion'));
    expect(drunk.length).toBeGreaterThan(0);
    expect(spared.length).toBeGreaterThan(0);
    // The potion is gone from the slot and the stock either way: nothing comes back.
    results.forEach(({ save }) => {
      expect(save.consumables.healingPotion ?? 0).toBe(0);
      expect(save.heroes.find((h) => h.id === 'bram')!.equipment.consumable).toBeNull();
    });
    // A potion nobody needed is broken back down, not returned.
    spared.forEach(({ report }) => {
      const entry = report.salvaged.find((s) => s.itemId === 'healingPotion')!;
      expect(entry.materials.length > 0 || entry.gold > 0).toBe(true);
    });
    results.forEach(({ report }) => expect(report.log.join(' ')).not.toMatch(/\{\w+\}/));
  });

  it('always uses up ward salves', () => {
    const save = equip(geared(), 'lyra', 'consumable', 'emberWardSalve');
    const started = startExpedition(save, 'cinderHollow', ALL, 0);
    expect(resolveExpedition(started, started.expeditions[0]).report.consumablesUsed).toContain('emberWardSalve');
  });

  it('keeps gear equipped whatever the outcome', () => {
    for (const { save } of outcomes(geared(), 'banditStockade', 30)) {
      expect(save.heroes.find((h) => h.id === 'bram')!.equipment.weapon).toBe('g1');
    }
  });

  it('drops the tier gear recipes in tier 1 dungeons', () => {
    const taught = new Set(
      ['ratCellar', 'goblinWarren'].flatMap((id) => outcomes(geared(), id, 300).map((r) => r.report.recipeId)),
    );
    expect(taught).toEqual(new Set([null, 'woodArmour', 'woodWand', 'woodBow']));
  });

  it('writes one line per played encounter plus a summary, naming the heroes', () => {
    for (const dungeon of dungeons) {
      for (const { report } of outcomes(geared(), dungeon.id, 20)) {
        // Every encounter played gets at most one line (quiet steps none), plus a summary
        // and any recipe, first-clear, charter, main-reward or salvage lines.
        const played = report.encountersCleared + (report.success ? 0 : 1);
        const extras = report.recipeId ? 1 : 0;
        expect(report.log.length).toBeGreaterThanOrEqual(2);
        expect(report.log.length).toBeLessThanOrEqual(played + 1 + extras + 5);
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
      gear: [{ uid: 'g1', itemId: 'woodSword', quality: 'normal' }],
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

  it('pays a little gold, the wooden bow blueprint and a tier 1 Sigil', () => {
    const started = startExpedition(tutorialSave(), 'ratCellar', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.gold).toBe(10);
    expect(report.recipeId).toBe('woodBow');
    expect(report.materials).toEqual([]);
    expect(report.mainRewards).toEqual([{ kind: 'sigil', tier: 1 }]);
    expect(save.sigils).toEqual([1]);
    expect(save.knownRecipes).toContain('woodBow');
    // The first Bandit Stockade win still guarantees its own Sigil.
    expect(save.firstSigilGiven).toBe(false);
  });

  it('respects the Sigil cap', () => {
    const full = { ...tutorialSave(), sigils: [1, 1, 1] };
    const started = startExpedition(full, 'ratCellar', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.mainRewards).toEqual([]);
    expect(save.sigils).toEqual([1, 1, 1]);
  });

  it('only applies to the first expedition', () => {
    expect(expeditionMinutes(createInitialSave(), dungeonById.banditStockade)).toBe(30);
    expect(startExpedition(createInitialSave(), 'ratCellar', ALL, 0).expeditions[0].guaranteed).toBe(false);
  });
});

describe('readyExpeditions', () => {
  it('lists only finished expeditions, even after the app was closed, and keeps their heroes away', () => {
    let save = startExpedition(allTiers(createInitialSave()), 'goblinWarren', ['bram'], 0);
    save = startExpedition(save, 'cinderHollow', ['lyra'], 0);
    expect(readyExpeditions(save, 20 * MIN).map((e) => e.dungeonId)).toEqual(['goblinWarren']);
    expect(save.expeditions).toHaveLength(2);
  });

  it('fast-forwards running expeditions', () => {
    const save = startExpedition(allTiers(createInitialSave()), 'cinderHollow', ['lyra'], 0);
    expect(readyExpeditions(fastForward(save, 5), 5)).toHaveLength(1);
  });
});

describe('daily boss bonus', () => {
  const boss = dungeonById.ogreQuarry;
  const DAY = 86_400_000;
  /** A strong team so the boss falls; runs finishing at `endsAt`. */
  const win = (save: SaveData, i: number, endsAt: number) => {
    const started = startExpedition({ ...save, nextUid: 100 + i }, boss.id, ALL, endsAt - boss.durationMinutes * MIN);
    return resolveExpedition(started, started.expeditions[0]);
  };
  const strong = () => ({ ...geared(), heroes: geared().heroes.map((h) => ({ ...h, level: 30 })) });

  it('comes with the first win of each rotation day only', () => {
    const day = Date.UTC(2026, 10, 2, 12);
    const wins = Array.from({ length: 40 }, (_, i) => win(strong(), i, day)).filter((r) => r.report.success);
    expect(wins.length).toBeGreaterThan(20);
    const first = wins[0];
    expect(bossBonusAvailable(first.save, boss.id, day)).toBe(false);
    expect(bossBonusAvailable(first.save, boss.id, day + DAY)).toBe(true);
    // The first win of the day always rolls; a repeat rolls the lower chance once.
    for (const r of wins) expect(r.report.mainRewards.length).toBeGreaterThanOrEqual(1);
    const repeats = Array.from({ length: 200 }, (_, i) => win(healAll(first.save), i, day)).filter((r) => r.report.success);
    const rolled = repeats.filter((r) => r.report.mainRewards.length > 0).length / repeats.length;
    expect(Math.max(...repeats.map((r) => r.report.mainRewards.length))).toBeLessThanOrEqual(1);
    expect(rolled).toBeGreaterThan(mainRewardRules.repeatMainRewardChance - 0.12);
    expect(rolled).toBeLessThan(mainRewardRules.repeatMainRewardChance + 0.12);
    expect(repeats.every((r) => r.save.bossBonusDays[boss.id] === first.save.bossBonusDays[boss.id])).toBe(true);
    // Next day, the bonus is back.
    const tomorrow = win(first.save, 0, day + DAY);
    if (tomorrow.report.success) expect(tomorrow.save.bossBonusDays[boss.id]).toBe(first.save.bossBonusDays[boss.id] + 1);
  });
});

describe('XP by tier', () => {
  it('teaches half one tier below the highest unlocked, a quarter further down', () => {
    const xpAt = (cleared: string[]) => {
      const save = { ...geared(), heroes: geared().heroes.map((h) => ({ ...h, level: 30 })), clearedDungeons: cleared };
      const started = startExpedition(save, 'ratCellar', ALL, 0);
      return resolveExpedition(started, started.expeditions[0]).report;
    };
    const full = xpAt([]);
    expect(full.success).toBe(true);
    expect(full.xp).toBe(dungeonById.ratCellar.xp);
    expect(xpAt(['banditStockade']).xp).toBe(Math.round(dungeonById.ratCellar.xp * xpRules.lowerTierShare[1]));
    expect(xpAt(BOSSES).xp).toBe(Math.round(dungeonById.ratCellar.xp * xpRules.lowerTierShare[2]));
  });
});

describe('materials come from walking', () => {
  it('leaves gathering materials out of every dungeon, wins and retreats alike', () => {
    for (const dungeon of dungeons) expect(dungeon.loot).toEqual([]);
    for (const { report } of outcomes(geared(), 'banditStockade', 60)) expect(report.materials).toEqual([]);
  });
});
