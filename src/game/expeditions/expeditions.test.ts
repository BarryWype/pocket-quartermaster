import { dungeons } from '@/content/dungeons';
import { xpRules, xpToNextLevel } from '@/content/heroes';
import { MATERIAL_TIERS } from '@/content/items';
import { dungeonById, monsterPartById, recipeById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import { tutorialRules } from '@/content/tutorial';

import { rotationDay } from '../dungeons/rotation';
import { composeBriefing } from '../threats/compose';
import { forgedItem } from '../crafting/crafting';
import { createInitialSave, type SaveData } from '../save';
import { healAll } from '../team/health';
import { equip } from '../team/team';
import {
  briefingOf,
  expeditionMinutes,
  fastForward,
  firstWinAvailable,
  isDungeonAvailable,
  isDungeonUnlocked,
  readyExpeditions,
  resolveExpedition,
  startExpedition,
  tutorialLoot,
} from './expeditions';
import { estimateOdds, oddsBand } from './odds';

const ALL = ['bram', 'lyra', 'mira'];
const MIN = 60_000;
const BOSSES = dungeons.filter((d) => d.isBoss).map((d) => d.id);
/** Every chain's boss and its predecessor, so every chain dungeon and boss is unlocked. */
const OPENERS = dungeons.filter((d) => d.isBoss || d.chainIndex === 5).map((d) => d.id);

/** Every tier revealed and the tutorial done, so any dungeon can be started. */
const allTiers = (save: SaveData): SaveData => ({
  ...save,
  clearedDungeons: OPENERS,
  tutorial: { ...save.tutorial, step: 'done' },
});

function geared(): SaveData {
  let save: SaveData = allTiers({
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    gear: [
      { uid: 'g1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g2', itemId: 'bow1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g3', itemId: 'wand1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g4', itemId: 'mail1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
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

/** The same save with every gear id's tier digit replaced. */
const atTier = (save: SaveData, tier: number): SaveData => ({ ...save, gear: save.gear.map((g) => ({ ...g, itemId: g.itemId.replace(/\d$/, String(tier)) })) });

/** Runs the same expedition with many seeds; resolution is deterministic per seed. */
function outcomes(save: SaveData, dungeonId: string, runs = 200, heroIds = ALL) {
  return Array.from({ length: runs }, (_, i) => {
    const started = startExpedition({ ...save, nextUid: i }, dungeonId, heroIds, 0);
    return resolveExpedition(started, started.expeditions[0]);
  });
}

describe('dungeon tiers', () => {
  it('has five tiers, each with a chain of six plus its boss, ordered by difficulty', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const inTier = dungeons.filter((d) => d.tier === tier);
      const [boss] = inTier.filter((d) => d.isBoss);
      const chain = inTier.filter((d) => !d.isBoss && !d.overnight);
      expect(chain.map((d) => d.difficulty)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'hard']);
      expect(chain.map((d) => d.chainIndex)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(boss.difficulty).toBe('boss');
      expect(boss.chainIndex).toBe(6);
      for (const d of chain) {
        expect(d.encounterCount[0]).toBeLessThan(boss.encounterCount[0]);
        // The elder dragon is eased below its lair's strength (see dragonLairBoss in content/enemies.ts).
        if (tier < 5) expect(boss.boss.hp).toBeGreaterThan(d.boss.hp);
      }
    }
  });

  it('opens only tier 1 at the start', () => {
    const fresh = createInitialSave();
    expect(new Set(dungeons.filter((d) => isDungeonUnlocked(fresh, d)).map((d) => d.tier))).toEqual(new Set([1]));
    expect(() => startExpedition(fresh, 'sunkenFord', ['bram'], 0)).toThrow();
  });

  it('opens the next tier once its boss has been beaten', () => {
    const save = { ...createInitialSave(), clearedDungeons: ['banditStockade'] };
    expect(isDungeonUnlocked(save, dungeonById.sunkenFord)).toBe(true);
    expect(isDungeonUnlocked(save, dungeonById.stormRidge)).toBe(false);
  });

  it('has each boss teach the pickaxe that opens the next tier material', () => {
    dungeons
      .filter((d) => d.isBoss)
      .forEach((boss) => expect(recipeById[`${MATERIAL_TIERS[boss.tier - 1].id}Pickaxe`]).toBeDefined());
  });
});

describe('startExpedition', () => {
  it('creates a timed expedition with the dungeon duration', () => {
    const save = startExpedition(allTiers(createInitialSave()), 'trollBridge', ['bram'], 1000);
    expect(save.expeditions[0]).toMatchObject({ dungeonId: 'trollBridge', heroIds: ['bram'], endsAt: 1000 + dungeonById.trollBridge.durationMinutes * MIN });
  });

  it('scales duration in debug mode', () => {
    const save = startExpedition(allTiers(createInitialSave()), 'trollBridge', ['bram'], 0, 1 / 60);
    expect(save.expeditions[0].endsAt).toBe(dungeonById.trollBridge.durationMinutes * 1000);
  });

  it('rejects busy heroes and empty parties', () => {
    const save = startExpedition(allTiers(createInitialSave()), 'goblinWarren', ['bram'], 0);
    expect(() => startExpedition(save, 'goblinWarren', ['bram', 'lyra'], 0)).toThrow();
    expect(() => startExpedition(save, 'goblinWarren', [], 0)).toThrow();
  });

  it('gives the first two expeditions after the tutorial no threats, and the third its own', () => {
    const dungeon = dungeonById.goblinWarren;
    const composed = composeBriefing(dungeon, rotationDay(0));
    expect(composed.threats.length).toBeGreaterThan(0);
    let save = allTiers(createInitialSave());
    for (const heroId of ['bram', 'lyra']) {
      expect(briefingOf(save, dungeon, undefined, 0).threats).toEqual([]);
      save = startExpedition(save, dungeon.id, [heroId], 0);
      expect(save.expeditions.at(-1)!.briefing!.threats).toEqual([]);
    }
    expect(save.stats.expeditionsLaunched).toBe(2);
    expect(briefingOf(save, dungeon, undefined, 0)).toEqual(composed);
    save = startExpedition(save, dungeon.id, ['mira'], 0);
    expect(save.expeditions.at(-1)!.briefing).toEqual(composed);
  });

  it('stands the escort down when its hero is sent', () => {
    const save = { ...allTiers(createInitialSave()), escort: { heroId: 'bram' } };
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
    // Tier-5 kit: the refit enemies outmatch the tier-1 wooden gear, so compare against gear a tier above the dungeon.
    const armed = estimateOdds(atTier(geared(), 5), ALL, dungeonById.goblinWarren, 100);
    expect(armed.success).toBeGreaterThan(naked.success);
    expect(estimateOdds(geared(), [], dungeonById.goblinWarren).success).toBe(0);
  });

  it('labels the odds', () => {
    expect(oddsBand(0.05)).toBe('Hopeless');
    expect(oddsBand(0.2)).toBe('Risky');
    expect(oddsBand(0.6)).toBe('Fair');
    expect(oddsBand(0.8)).toBe('Favourable');
    expect(oddsBand(0.95)).toBe('AlmostSure');
    // Band boundaries.
    expect(oddsBand(0.15)).toBe('Risky');
    expect(oddsBand(0.4)).toBe('Fair');
    expect(oddsBand(0.65)).toBe('Favourable');
    expect(oddsBand(0.9)).toBe('AlmostSure');
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
    // Tier 1 is still the highest, so its XP isn't reduced; levelled heroes, so the boss falls sometimes.
    // Rat Cellar counts as the day's first win; the boss is the tier's first clear, so its bonus XP shows too.
    const save = {
      ...geared(),
      heroes: geared().heroes.map((h) => ({ ...h, level: 4 })),
      clearedDungeons: ['ratCellar', 'millRuins'],
      firstWinDay: rotationDay(dungeon.durationMinutes * MIN),
    };
    const results = outcomes(save, dungeon.id);
    const wins = results.filter((r) => r.report.success);
    const retreats = results.filter((r) => r.report.outcome === 'retreat');
    expect(wins.length).toBeGreaterThan(0);
    expect(retreats.length).toBeGreaterThan(0);
    const firstTierXp = lootConfig.bonusRows.firstTierClear.xp;
    wins.forEach(({ report }) => expect(report.xp).toBe(Math.round(dungeon.xp * (1 + firstTierXp))));
    retreats.forEach(({ report }) => {
      const share = report.encountersCleared / report.encounterCount;
      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThan(1);
      expect(report.xp).toBe(Math.round(dungeon.xp * share));
      expect(report.loot.recipeIds).toEqual([]);
      expect(report.loot.dropped).toEqual([]);
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
    const results = outcomes({ ...geared(), clearedDungeons: ['millRuins'] }, 'banditStockade', 50);
    results.forEach(({ save, report }) =>
      expect(save.clearedDungeons.includes('banditStockade')).toBe(report.success),
    );
  });

  it('always hands over the next pickaxe when a boss falls', () => {
    const strong = { ...geared(), heroes: geared().heroes.map((h) => ({ ...h, level: 3 })) };
    const wins = outcomes(strong, 'banditStockade').filter((r) => r.report.success);
    wins.forEach(({ save }) => expect(save.knownRecipes).toContain('woodPickaxe'));
  });

  it('applies rewards and XP to the save, and never wears gear down', () => {
    const started = startExpedition(geared(), 'goblinWarren', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(save.expeditions).toEqual([]);
    expect(save.reports[0]).toEqual(report);
    const salvageGold = report.salvaged.reduce((sum, s) => sum + s.gold, 0);
    expect(save.gold).toBe(report.gold + salvageGold);
    // Mira is a quick learner: +20% XP.
    const total = (h: { level: number; xp: number }) =>
      h.xp + Array.from({ length: h.level - 1 }, (_, i) => xpToNextLevel(i + 1)).reduce((sum, need) => sum + need, 0);
    save.heroes.forEach((hero) =>
      expect(total(hero)).toBe(Math.round(report.xp * (hero.trait === 'quickLearner' ? 1.2 : 1))),
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

  it('keeps gear equipped whatever the outcome', () => {
    for (const { save } of outcomes(geared(), 'banditStockade', 30)) {
      expect(save.heroes.find((h) => h.id === 'bram')!.equipment.weapon).toBe('g1');
    }
  });

  it('drops the tier gear blueprints in tier 1 dungeons', () => {
    // Veterans, so the long goblin warren is won often enough to teach its blueprints.
    const strong = { ...geared(), heroes: geared().heroes.map((h) => ({ ...h, level: 15 })) };
    const taught = new Set(
      ['ratCellar', 'goblinWarren'].flatMap((id) => outcomes(strong, id, 300).flatMap((r) => r.report.loot.recipeIds)),
    );
    expect(taught.size).toBeGreaterThan(0);
    const known = createInitialSave().knownRecipes;
    for (const id of taught) {
      expect(id).toMatch(/1$/);
      expect(known).not.toContain(id);
    }
  });

  it('writes one line per played encounter plus a summary, naming the heroes', () => {
    // Two heroes, so a day with Narrow passages lets them in too.
    for (const dungeon of dungeons) {
      for (const { report } of outcomes(geared(), dungeon.id, 20, ALL.slice(0, 2))) {
        // Every encounter played gets at most one line (quiet steps none), plus a summary
        // and any recipe, first-win, first-clear, charter or salvage lines.
        const played = report.encountersCleared + (report.success ? 0 : 1);
        expect(report.log.length).toBeGreaterThanOrEqual(2);
        expect(report.log.length).toBeLessThanOrEqual(played + 8);
        expect(report.log.join(' ')).not.toMatch(/\{\w+\}/);
      }
    }
    const won = outcomes(geared(), 'ratCellar', 20).find((r) => r.report.success)!;
    expect(won.report.log.join(' ')).toMatch(/Bram|Lyra|Mira/);
  });
});

describe('forced loot', () => {
  it('force-drops a category from debug', () => {
    const wins = Array.from({ length: 20 }, (_, i) => {
      const run = startExpedition({ ...geared(), nextUid: i }, 'ratCellar', ALL, 0);
      return resolveExpedition(run, run.expeditions[0], { loot: { force: 'keyFragments' } });
    }).filter((r) => r.report.success);
    expect(wins.length).toBeGreaterThan(0);
    wins.forEach(({ save, report }) => {
      expect(report.loot.keyFragments).toBeGreaterThanOrEqual(1);
      expect(report.loot.dropped).toContain('keyFragments');
      expect(save.keyFragments).toBe(report.loot.keyFragments);
    });
  });

  it('force-drops treasure maps, granted unread with a rarity', () => {
    const wins = Array.from({ length: 20 }, (_, i) => {
      const run = startExpedition({ ...geared(), nextUid: i }, 'ratCellar', ALL, 0);
      return resolveExpedition(run, run.expeditions[0], { loot: { force: 'treasureMaps' } });
    }).filter((r) => r.report.success);
    expect(wins.length).toBeGreaterThan(0);
    wins.forEach(({ save, report }) => {
      expect(report.loot.treasureMaps.length).toBeGreaterThanOrEqual(1);
      for (const map of report.loot.treasureMaps) expect(map.rarity).toEqual(expect.stringMatching(/common|rare|legendary/));
      expect(report.loot.dropped).toContain('treasureMaps');
      expect(save.treasureMaps).toHaveLength(report.loot.treasureMaps.length);
      for (const map of save.treasureMaps) expect(map.location).toBeNull();
    });
  });
});

describe('tutorial expedition', () => {
  /** Fresh from the tutorial: only Bram's wooden sword, about to send the first expedition. */
  const tutorialSave = (): SaveData => {
    const save: SaveData = {
      ...createInitialSave(),
      gear: [{ uid: 'g1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }],
      tutorial: { ...createInitialSave().tutorial, step: 'sendExpedition' },
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

  it('starts a new game with tier 1 blueprints only, a weapon and an armour among them', () => {
    const gear = createInitialSave()
      .knownRecipes.map((id) => forgedItem(recipeById[id]))
      .filter((item) => item !== null);
    expect(new Set(gear.map((item) => item.tier))).toEqual(new Set([1]));
    expect(gear.map((item) => item.slot)).toEqual(expect.arrayContaining(['weapon', 'armor', 'offhand']));
  });

  it('pays the day’s first win: one new tier 1 blueprint, and no Sigil', () => {
    const before = tutorialSave();
    const started = startExpedition(before, 'ratCellar', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.firstWin).toBe(true);
    expect(save.firstWinDay).toBe(rotationDay(5000));
    expect(report.loot).toEqual(tutorialLoot(before, 5000));
    expect(report.loot.recipeIds).toEqual([tutorialRules.blueprintRecipe]);
    expect(before.knownRecipes).not.toContain(tutorialRules.blueprintRecipe);
    expect(save.knownRecipes).toContain(tutorialRules.blueprintRecipe);
    const tierOne = (ids: string[]) => ids.filter((id) => forgedItem(recipeById[id])?.tier === 1);
    expect(tierOne(save.knownRecipes)).toHaveLength(tierOne(before.knownRecipes).length + 1);
    expect(report.sigil).toBeUndefined();
    expect(save.sigils).toEqual([]);
  });

  it('drops the tier 1 bow blueprint only when it is not known yet', () => {
    const knows = { ...tutorialSave(), knownRecipes: [...tutorialSave().knownRecipes, tutorialRules.blueprintRecipe] };
    const loot = tutorialLoot(knows, 5000);
    expect(loot.recipeIds).toHaveLength(1);
    expect(loot.recipeIds).not.toContain(tutorialRules.blueprintRecipe);
    expect(knows.knownRecipes).not.toContain(loot.recipeIds[0]);
  });

  it('only applies to the tutorial expedition', () => {
    const done = allTiers(createInitialSave());
    expect(expeditionMinutes(done, dungeonById.banditStockade)).toBe(30);
    expect(startExpedition(done, 'ratCellar', ALL, 0).expeditions[0].guaranteed).toBe(false);
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

describe('first win of the day', () => {
  const boss = dungeonById.ogreQuarry;
  const DAY = 86_400_000;
  /** A strong team so the boss falls; runs finishing at `endsAt`. */
  const win = (save: SaveData, i: number, endsAt: number, dungeonId = boss.id) => {
    const dungeon = dungeonById[dungeonId];
    const started = startExpedition({ ...save, nextUid: 100 + i }, dungeonId, ALL, endsAt - dungeon.durationMinutes * MIN);
    return resolveExpedition(started, started.expeditions[0]);
  };
  const strong = () => ({ ...atTier(geared(), 2), heroes: geared().heroes.map((h) => ({ ...h, level: 15 })) });
  const day = Date.UTC(2026, 10, 2, 12);

  it('is rolled once per rotation day, for dungeons and tier bosses alike', () => {
    const first = win(strong(), 0, day);
    expect(first.report.success).toBe(true);
    expect(first.report.firstWin).toBe(true);
    expect(first.save.firstWinDay).toBe(rotationDay(day));
    expect(firstWinAvailable(first.save, boss, day)).toBe(false);
    expect(firstWinAvailable(first.save, boss, day + DAY)).toBe(true);

    // A repeat win of the same day rolls no first win.
    const repeats = Array.from({ length: 40 }, (_, i) => win(healAll(first.save), i, day + 30_000 + i)).filter((r) => r.report.success);
    expect(repeats.length).toBeGreaterThan(0);
    repeats.forEach(({ report, save }) => {
      expect(report.firstWin).toBeUndefined();
      expect(save.firstWinDay).toBe(first.save.firstWinDay);
    });

    // The next rotation day, the bonus is back.
    const tomorrow = win(first.save, 0, day + DAY);
    if (tomorrow.report.success) {
      expect(tomorrow.report.firstWin).toBe(true);
      expect(tomorrow.save.firstWinDay).toBe(rotationDay(day + DAY));
    }
  });

  it('is never rolled for overnight expeditions', () => {
    const overnight = dungeons.find((d) => d.overnight && d.tier === 1)!;
    const before = strong();
    const result = win(before, 0, day, overnight.id);
    expect(result.report.success).toBe(true);
    expect(result.report.firstWin).toBeUndefined();
    expect(result.save.firstWinDay).toBe(before.firstWinDay);
  });
});

describe('first tier clear', () => {
  const win = (save: SaveData, dungeonId: string, endsAt = 0) => {
    const dungeon = dungeonById[dungeonId];
    const started = startExpedition({ ...save, nextUid: 100 }, dungeonId, ALL, endsAt - dungeon.durationMinutes * MIN);
    return resolveExpedition(started, started.expeditions[0]);
  };
  const strong = () => ({ ...geared(), heroes: geared().heroes.map((h) => ({ ...h, level: 15 })), clearedDungeons: [] });

  it('is paid only through the tier boss; chain dungeons pay their own first clear', () => {
    const first = win(strong(), 'ratCellar');
    expect(first.report.success).toBe(true);
    expect(first.report.firstTierClear).toBeUndefined();
    expect(first.report.firstDungeonClear).toBe(true);
    // The tier is cleared now: no other tier 1 dungeon pays it again.
    const second = win(first.save, 'spiderBurrow');
    expect(second.report.success).toBe(true);
    expect(second.report.firstTierClear).toBeUndefined();
    expect(second.report.firstDungeonClear).toBe(true);
    // The tier's first clear is the boss's own; it opens once its chain is cleared.
    const boss = win({ ...second.save, clearedDungeons: [...second.save.clearedDungeons, 'millRuins'] }, 'banditStockade');
    expect(boss.report.success).toBe(true);
    expect(boss.report.firstTierClear).toBe(true);
    expect(boss.report.firstDungeonClear).toBeUndefined();
  });

  it('is paid again for the next tier', () => {
    // The tier's chain head, unlocked with the tier-1 boss and still the tier's first clear.
    const base: SaveData = { ...atTier(strong(), 2), clearedDungeons: ['banditStockade'] };
    const result = win(base, 'sunkenFord', 86_400_000);
    expect(result.report.success).toBe(true);
    expect(result.report.firstTierClear).toBeUndefined();
    expect(result.report.firstDungeonClear).toBe(true);
  });
});

describe('XP by tier', () => {
  it('teaches half one tier below the highest unlocked, a quarter further down', () => {
    const T = 30 * MIN;
    // Rat Cellar already cleared and the day's first win claimed, so only the run's XP shows.
    const xpAt = (cleared: string[]) => {
      const save = {
        ...geared(),
        heroes: geared().heroes.map((h) => ({ ...h, level: 15 })),
        clearedDungeons: ['ratCellar', ...cleared],
        firstWinDay: rotationDay(T),
      };
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
    const SHARDS = ['fireShard', 'waterShard', 'electricShard', 'earthShard', 'airShard'];
    for (const { report } of outcomes(geared(), 'banditStockade', 60)) {
      expect(report.loot.materials.filter((m) => !SHARDS.includes(m.materialId) && !monsterPartById[m.materialId])).toEqual([]);
    }
  });
});
